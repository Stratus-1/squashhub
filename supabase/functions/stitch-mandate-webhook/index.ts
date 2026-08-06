// Receives Stitch webhook events for mandate (authorization) status changes.
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
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const rawBody = await req.text();
    const signature = getStitchSignature(req);
    let body: any;
    try { body = JSON.parse(rawBody); } catch { return json({ error: "bad json" }, 400); }

    // If this is an actual debit on a recurring arrangement (it carries an
    // amount), the collection handler owns it — forward and stop.
    const evAmount = Number(body?.amount || body?.data?.amount || 0);
    const evStatus = String(body?.status || "").toUpperCase();
    if (evAmount > 0 && /PAID|COMPLETE|COMPLETED|SETTLED|SUCCESS|FAILED|DECLINED|REJECTED/.test(evStatus)) {
      const fwd = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/stitch-collection-webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "svix-id": req.headers.get("svix-id") || "",
          "svix-timestamp": req.headers.get("svix-timestamp") || "",
          "svix-signature": req.headers.get("svix-signature") || "",
        },
        body: rawBody,
      });
      return new Response(await fwd.text(), { status: fwd.status });
    }


    // Two payload shapes are possible:
    //  1. Stitch Express / Svix flat: { id, status, type: "SUBSCRIPTION"|"CONSENT",
    //     subscriptionId, consentId, linkId }
    //  2. Legacy GraphQL envelope: { data: { node: { id, state: {...} } } }
    const node = body?.data?.node || body?.node || body;
    const candidates = [
      body?.subscriptionId,
      body?.consentId,
      body?.linkId,
      node?.subscriptionId,
      node?.consentId,
      node?.id,
      body?.id,
    ].filter((v: unknown): v is string => typeof v === "string" && v.length > 0);

    const eventType: string = body?.type || node?.__typename || "";
    const stateType: string = node?.state?.__typename || body?.status || node?.status || "";

    if (candidates.length === 0) {
      console.warn("webhook: no stitch id in payload", JSON.stringify(body).slice(0, 500));
      return json({ ok: true, ignored: true });
    }

    // Find mandate by any of the candidate ids and the owning club so we can
    // verify the signature against that club's stored signing secret.
    const { data: mandate } = await admin
      .from("stitch_mandates")
      .select("id, status, club_id, user_id, club_member_id, mandate_type, stitch_mandate_id")
      .in("stitch_mandate_id", candidates)
      .maybeSingle();
    if (!mandate) {
      console.warn("webhook: unmatched stitch ids", candidates.join(","), "type", eventType, "status", stateType);
      return json({ ok: true, unmatched: true });
    }
    const stitchId = mandate.stitch_mandate_id;


    const { data: secrets } = await admin.from("club_secrets")
      .select("payment_gateway_credentials").eq("club_id", mandate.club_id).maybeSingle();
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
    const signingSecret = (creds.webhook_secret || Deno.env.get("STITCH_WEBHOOK_SIGNING_SECRET") || creds.client_secret || "").trim();
    const svixId = req.headers.get("svix-id") || "";
    const svixTs = req.headers.get("svix-timestamp") || "";
    const svixSig = req.headers.get("svix-signature") || "";
    if (signingSecret && svixId && svixTs && svixSig) {
      try {
        new Webhook(signingSecret).verify(rawBody, {
          "svix-id": svixId, "svix-timestamp": svixTs, "svix-signature": svixSig,
        });
      } catch (err) {
        console.error("stitch-mandate-webhook: Svix verify failed", (err as Error).message);
        return json({ error: "invalid signature" }, 401);
      }
    } else if (signingSecret && signature) {
      const valid = await verifyStitchSignature(rawBody, signature, signingSecret);
      if (!valid) {
        console.error("stitch-mandate-webhook: invalid signature for mandate", stitchId);
        return json({ error: "invalid signature" }, 401);
      }
    } else if (signature || svixSig) {
      console.warn("stitch-mandate-webhook: signature present but no signing secret for club", mandate.club_id);
    }

    let newStatus: string | null = null;
    const t = (stateType + " " + eventType).toLowerCase();
    if (t.includes("complete") || t.includes("authorized") || t.includes("authorised") || t.includes("active") || t.includes("success")) {
      newStatus = "active";
    } else if (t.includes("declined") || t.includes("failed") || t.includes("rejected") || t.includes("expired")) {
      newStatus = "failed";
    } else if (t.includes("cancel")) {
      newStatus = "cancelled";
    }

    if (newStatus && newStatus !== mandate.status) {
      const patch: Record<string, unknown> = { status: newStatus };
      if (newStatus === "active") patch.authorised_at = new Date().toISOString();
      if (newStatus === "cancelled") patch.cancelled_at = new Date().toISOString();
      await admin.from("stitch_mandates").update(patch).eq("id", mandate.id);

      // Stitch takes the first charge as soon as the payer authorises. Record
      // it as a payment on the member's account, dated on the day the
      // recurring arrangement came into effect. It settles the oldest
      // outstanding fees it fully covers and the remainder sits as a payment
      // on account — both post to the general ledger.
      if (newStatus === "active") {
        const { data: rec, error: recErr } = await admin.rpc(
          "record_mandate_initial_payment",
          { _mandate_id: mandate.id },
        );
        if (recErr) console.error("initial payment record failed", mandate.id, recErr.message);
        else console.log("initial payment recorded", mandate.id, JSON.stringify(rec));
      }
    }



    return json({ ok: true, mandate_id: mandate.id, status: newStatus || mandate.status });
  } catch (e) {
    console.error("stitch-mandate-webhook fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
