// Daily job: submits approved collections that are due today (or earlier) to
// Stitch via paymentInitiationRequestCreate. Also auto-approves any 'queued'
// row older than 2 days that admin didn't edit/cancel (the approval window).
//
// Auth: service-role for cron, or club admin JWT for manual run.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const STITCH_TOKEN_URL = "https://secure.stitch.money/connect/token";
const STITCH_GRAPHQL = "https://api.stitch.money/graphql";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getToken(clientId: string, clientSecret: string, scope: string): Promise<string | null> {
  const resp = await fetch(STITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope,
      audience: "https://secure.stitch.money",
    }),
  });
  const j = await resp.json().catch(() => ({}));
  return resp.ok ? j.access_token || null : null;
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
      .select("id, club_id, mandate_id, club_member_id, amount_cents, due_date, fee_payable_id, attempt_number, stitch_mandates(stitch_mandate_id, rail)")
      .eq("status", "approved")
      .lte("due_date", today);
    if (restrictClubId) dueQ = dueQ.eq("club_id", restrictClubId);
    const { data: due, error: dueErr } = await dueQ;
    if (dueErr) return json({ error: dueErr.message }, 500);

    let submitted = 0;
    let failed = 0;

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
      if (!creds.client_id || !creds.client_secret) {
        for (const r of rows) {
          await admin.from("stitch_collections").update({
            status: "failed",
            failed_reason: "Stitch credentials missing on club",
          }).eq("id", r.id);
          failed++;
        }
        continue;
      }
      const token = await getToken(creds.client_id, creds.client_secret, "client_paymentrequest");
      if (!token) {
        for (const r of rows) {
          await admin.from("stitch_collections").update({
            status: "failed",
            failed_reason: "Stitch token request failed",
          }).eq("id", r.id);
          failed++;
        }
        continue;
      }

      for (const r of rows) {
        const mandateRef = (r as any).stitch_mandates?.stitch_mandate_id;
        if (!mandateRef) {
          await admin.from("stitch_collections").update({
            status: "failed", failed_reason: "Mandate not linked to Stitch ID",
          }).eq("id", r.id);
          failed++;
          continue;
        }
        const amount = (r.amount_cents / 100).toFixed(2);
        const mutation = `
          mutation Init($input: PaymentInitiationRequestCreateInput!) {
            paymentInitiationRequestCreate(input: $input) {
              paymentInitiationRequest { id }
            }
          }`;
        const variables = {
          input: {
            amount: { quantity: amount, currency: "ZAR" },
            payerReference: `MND-${r.mandate_id.slice(0, 8)}`,
            beneficiaryReference: `COL-${r.id.slice(0, 8)}`,
            externalReference: r.id,
            mandateId: mandateRef,
          },
        };
        const resp = await fetch(STITCH_GRAPHQL, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: mutation, variables }),
        });
        const j = await resp.json().catch(() => ({}));
        if (!resp.ok || j.errors) {
          const msg = j?.errors?.[0]?.message || `HTTP ${resp.status}`;
          await admin.from("stitch_collections").update({
            status: "failed", failed_reason: msg.slice(0, 500),
          }).eq("id", r.id);
          failed++;
          continue;
        }
        const stitchId = j?.data?.paymentInitiationRequestCreate?.paymentInitiationRequest?.id || null;
        await admin.from("stitch_collections").update({
          status: "submitted",
          submitted_at: new Date().toISOString(),
          stitch_collection_id: stitchId,
        }).eq("id", r.id);
        submitted++;
      }
    }

    return json({ ok: true, submitted, failed, due_count: due?.length || 0 });
  } catch (e) {
    console.error("stitch-submit-collections fatal", e);
    return json({ error: (e as Error).message || "Unexpected" }, 500);
  }
});
