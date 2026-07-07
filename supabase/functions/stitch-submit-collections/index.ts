// Daily job: submits approved collections that are due today (or earlier).
//
// For each collection we look at its mandate:
//   • mandate_type = "card_consent" → POST /card-consents/{id}/initiate-payment
//     (Stitch Express) with the exact amount owed.
//   • mandate_type = "subscription" → Stitch Express charges automatically on
//     the subscription day; we mark the collection as `auto` and let the
//     collection webhook flip it to succeeded/failed when Stitch reports back.
//
// Also auto-approves any 'queued' row older than 2 days that admin didn't edit
// or cancel (the 2-day approval window).
//
// Auth: service-role for cron, or club admin JWT for manual run.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const STITCH_BASE = "https://express.stitch.money/api/v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getExpressToken(clientId: string, clientSecret: string): Promise<string | null> {
  const resp = await fetch(`${STITCH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret, scope: "client_recurringpaymentconsentrequest" }),
  });
  const j = await resp.json().catch(() => ({}));
  return resp.ok ? j?.data?.accessToken || null : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const restrictClubId: string | null = body?.club_id || null;

    // 1. Auto-approve anything that has sat in the queue > 2 days.
    const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    let autoApproveQ = admin
      .from("stitch_collections")
      .update({ status: "approved", approved_at: new Date().toISOString(), approval_required: false })
      .eq("status", "queued")
      .lt("created_at", cutoff);
    if (restrictClubId) autoApproveQ = autoApproveQ.eq("club_id", restrictClubId);
    await autoApproveQ;

    // 2. Find approved collections whose due_date has arrived.
    const today = new Date().toISOString().slice(0, 10);
    let dueQ = admin
      .from("stitch_collections")
      .select("id, club_id, mandate_id, club_member_id, amount_cents, due_date, fee_payable_id, attempt_number, stitch_mandates(stitch_mandate_id, mandate_type)")
      .eq("status", "approved")
      .lte("due_date", today);
    if (restrictClubId) dueQ = dueQ.eq("club_id", restrictClubId);
    const { data: due, error: dueErr } = await dueQ;
    if (dueErr) return json({ error: dueErr.message }, 500);

    let submitted = 0;
    let failed = 0;
    let deferred = 0;

    // Group by club so we only request a token once per club.
    const byClub = new Map<string, any[]>();
    for (const c of due || []) {
      const arr = byClub.get(c.club_id) || [];
      arr.push(c);
      byClub.set(c.club_id, arr);
    }

    for (const [clubId, rows] of byClub) {
      const { data: secrets } = await admin
        .from("club_secrets")
        .select("payment_gateway_credentials")
        .eq("club_id", clubId)
        .maybeSingle();
      const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
      const clientId = (creds.client_id || "").trim();
      const clientSecret = (creds.client_secret || "").trim();

      // We only need a token if there are card_consent collections to charge.
      const needsToken = rows.some((r: any) => r.stitch_mandates?.mandate_type === "card_consent");
      let token: string | null = null;
      if (needsToken) {
        if (!clientId || !clientSecret) {
          for (const r of rows) {
            if (r.stitch_mandates?.mandate_type !== "card_consent") continue;
            await admin.from("stitch_collections").update({
              status: "failed", failed_reason: "Stitch credentials missing on club",
            }).eq("id", r.id);
            failed++;
          }
          continue;
        }
        token = await getExpressToken(clientId, clientSecret);
        if (!token) {
          for (const r of rows) {
            if (r.stitch_mandates?.mandate_type !== "card_consent") continue;
            await admin.from("stitch_collections").update({
              status: "failed", failed_reason: "Stitch token request failed",
            }).eq("id", r.id);
            failed++;
          }
          continue;
        }
      }

      for (const r of rows) {
        const mandateType = (r as any).stitch_mandates?.mandate_type || "card_consent";
        const stitchRef = (r as any).stitch_mandates?.stitch_mandate_id;

        if (mandateType === "subscription") {
          // Stitch charges automatically on its schedule — nothing to submit.
          // Flag the row so it stops showing in the "due" queue and the webhook
          // can finalise it when Stitch reports success/failure.
          await admin.from("stitch_collections").update({
            status: "auto",
            submitted_at: new Date().toISOString(),
            failed_reason: null,
          }).eq("id", r.id);
          deferred++;
          continue;
        }

        // card_consent → charge via Express initiate-payment.
        if (!stitchRef) {
          await admin.from("stitch_collections").update({
            status: "failed", failed_reason: "Mandate not linked to Stitch card consent",
          }).eq("id", r.id);
          failed++;
          continue;
        }
        const initBody = {
          amount: r.amount_cents,
          merchantReference: `COL-${r.id.slice(0, 8)}`,
          externalReference: r.id,
        };
        const resp = await fetch(`${STITCH_BASE}/card-consents/${encodeURIComponent(stitchRef)}/initiate-payment`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(initBody),
        });
        const j = await resp.json().catch(() => ({}));
        if (!resp.ok || !j?.success) {
          const msg = j?.error?.message || j?.message || (j?.errors && JSON.stringify(j.errors)) || `HTTP ${resp.status}`;
          console.error("initiate-payment failed", r.id, resp.status, msg);
          await admin.from("stitch_collections").update({
            status: "failed", failed_reason: String(msg).slice(0, 500),
          }).eq("id", r.id);
          failed++;
          continue;
        }
        const stitchPaymentId = j?.data?.payment?.id || j?.data?.id || null;
        await admin.from("stitch_collections").update({
          status: "submitted",
          submitted_at: new Date().toISOString(),
          stitch_collection_id: stitchPaymentId,
        }).eq("id", r.id);
        submitted++;
      }
    }

    return json({ ok: true, submitted, failed, deferred, due_count: due?.length || 0 });
  } catch (e) {
    console.error("stitch-submit-collections fatal", e);
    return json({ error: (e as Error).message || "Unexpected" }, 500);
  }
});
