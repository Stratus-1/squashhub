// Handles Stitch webhook events for in-flight collections (recurring debits).
//
// Two payload shapes are supported:
//  1. Stitch Express / Svix flat: { id, amount, status, type: "SUBSCRIPTION"|"CONSENT",
//     subscriptionId, consentId, linkId }
//  2. Legacy GraphQL envelope: { data: { paymentInitiationRequest: {...} } }
//
// On a successful debit we settle the collection, post the money to the
// member's account (record_collection_payment), mark the linked fee paid and
// clear the mandate's failure counter. On failure we bump the counter, suspend
// after 3 strikes and schedule retries.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  getStitchSignature,
  verifyStitchSignature,
} from "../_shared/stitch-signature.ts";
import { Webhook } from "npm:svix@1.42.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-stitch-signature, stitch-signature, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const rawBody = await req.text();
    const signature = getStitchSignature(req);
    const svixId = req.headers.get("svix-id") || "";
    const svixTs = req.headers.get("svix-timestamp") || "";
    const svixSig = req.headers.get("svix-signature") || "";

    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { return json({ error: "bad json" }, 400); }

    const ev = payload?.data || payload;
    const stitchId =
      ev?.paymentInitiationRequest?.id ||
      ev?.id ||
      ev?.externalReference ||
      null;
    const eventType: string =
      ev?.eventType || ev?.status || ev?.paymentInitiationRequest?.status || "";
    // Ids that may point at the recurring arrangement rather than the payment.
    const mandateCandidates: string[] = [
      payload?.subscriptionId, payload?.consentId,
      ev?.subscriptionId, ev?.consentId,
    ].filter((v: unknown): v is string => typeof v === "string" && v.length > 0);
    const amountCents: number | null =
      typeof ev?.amount === "number" ? Math.round(ev.amount) : null;

    if (!stitchId && mandateCandidates.length === 0) return json({ ok: true, ignored: true });

    // ---- Locate the collection --------------------------------------------
    let col: any = null;
    if (stitchId) {
      const { data } = await admin
        .from("stitch_collections").select("*")
        .eq("stitch_collection_id", stitchId).maybeSingle();
      col = data;
      if (!col) {
        const { data: byExt } = await admin
          .from("stitch_collections").select("*").eq("id", stitchId).maybeSingle();
        col = byExt;
      }
    }

    // Subscription debits carry no collection id — match on the mandate and
    // pick the oldest collection still waiting to be confirmed.
    let mandate: any = null;
    if (!col && mandateCandidates.length > 0) {
      const { data: m } = await admin
        .from("stitch_mandates")
        .select("id, club_id, club_member_id, max_amount_cents, fee_category_id")
        .in("stitch_mandate_id", mandateCandidates)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      mandate = m;
      if (mandate) {
        const { data: open } = await admin
          .from("stitch_collections").select("*")
          .eq("mandate_id", mandate.id)
          .in("status", ["queued", "approved", "submitted"])
          .order("due_date", { ascending: true });
        const rows = open || [];
        col = (amountCents ? rows.find((r: any) => r.amount_cents === amountCents) : null)
          || rows[0] || null;
      }
    }

    // Money arrived but we have nothing queued for it — record it anyway so it
    // never goes missing from the member's statement.
    if (!col && mandate && /complete|paid|settled|success/i.test(eventType)) {
      const { data: created } = await admin.from("stitch_collections").insert({
        club_id: mandate.club_id,
        mandate_id: mandate.id,
        club_member_id: mandate.club_member_id,
        amount_cents: amountCents ?? mandate.max_amount_cents,
        due_date: new Date().toISOString().slice(0, 10),
        status: "approved",
        approval_required: false,
        attempt_number: 1,
      }).select("*").maybeSingle();
      col = created;
    }

    if (!col) return json({ ok: true, unknown: true });

    // ---- Verify signature --------------------------------------------------
    const { data: secrets } = await admin.from("club_secrets")
      .select("payment_gateway_credentials").eq("club_id", col.club_id).maybeSingle();
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
    const signingSecret = (creds.webhook_secret || creds.client_secret || "").trim();

    if (signingSecret && svixId && svixTs && svixSig) {
      try {
        new Webhook(signingSecret).verify(rawBody, {
          "svix-id": svixId, "svix-timestamp": svixTs, "svix-signature": svixSig,
        });
      } catch (err) {
        console.error("stitch-collection-webhook: Svix verify failed", (err as Error).message);
        return json({ error: "invalid signature" }, 401);
      }
    } else if (signingSecret && signature) {
      const valid = await verifyStitchSignature(rawBody, signature, signingSecret);
      if (!valid) {
        console.error("stitch-collection-webhook: invalid signature for collection", col.id);
        return json({ error: "invalid signature" }, 401);
      }
    } else if (signature || svixSig) {
      console.warn("stitch-collection-webhook: signature present but no signing secret for club", col.club_id);
    }

    const isPaid = /complete|paid|settled|success/i.test(eventType);
    const isFailed = /fail|reject|expir|cancel/i.test(eventType);

    if (isPaid) {
      // Gateways retry deliveries until they get an OK — never post twice.
      const alreadyPosted = !!col.posted_at;
      const settledAt = col.settled_at || new Date().toISOString();

      await admin.from("stitch_collections").update({
        status: "paid",
        settled_at: settledAt,
        stitch_collection_id: col.stitch_collection_id || (stitchId ?? null),
      }).eq("id", col.id);

      if (!alreadyPosted) {
        // Posts the money to the member's account, settles the linked fee and
        // stamps posted_at inside one transaction (idempotent).
        const { error: postErr } = await admin.rpc("record_collection_payment", {
          _collection_id: col.id,
        });
        if (postErr) console.error("record_collection_payment failed", col.id, postErr.message);
      }


      // Reset failure counter, refresh last_collection_at, clear suspension.
      await admin.from("stitch_mandates").update({
        consecutive_failures: 0,
        last_collection_at: settledAt,
        suspended_at: null,
      }).eq("id", col.mandate_id);
      await admin.from("club_members").update({
        access_suspended_at: null,
      }).eq("id", col.club_member_id);
    } else if (isFailed) {
      await admin.from("stitch_collections").update({
        status: "failed", failed_reason: String(eventType).slice(0, 500),
      }).eq("id", col.id);

      const { data: mandateRow } = await admin
        .from("stitch_mandates")
        .select("id, consecutive_failures").eq("id", col.mandate_id).maybeSingle();
      const fails = (mandateRow?.consecutive_failures || 0) + 1;
      const suspend = fails >= 3;
      await admin.from("stitch_mandates").update({
        consecutive_failures: fails,
        suspended_at: suspend ? new Date().toISOString() : null,
        status: suspend ? "failed" : "active",
      }).eq("id", col.mandate_id);
      if (suspend) {
        await admin.from("club_members").update({
          access_suspended_at: new Date().toISOString(),
        }).eq("id", col.club_member_id);
      }

      // Schedule retries at +2 and +5 days (only on attempts 1 & 2).
      if (col.attempt_number < 3 && !suspend) {
        const offsetDays = col.attempt_number === 1 ? 2 : 5;
        const nextDue = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
          .toISOString().slice(0, 10);
        await admin.from("stitch_collections").insert({
          club_id: col.club_id,
          mandate_id: col.mandate_id,
          club_member_id: col.club_member_id,
          fee_payable_id: col.fee_payable_id,
          amount_cents: col.amount_cents,
          due_date: nextDue,
          status: "approved",
          approval_required: false,
          attempt_number: col.attempt_number + 1,
          retry_of: col.id,
        });
      }
    }

    return json({ ok: true, collection_id: col.id });
  } catch (e) {
    console.error("stitch-collection-webhook fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
