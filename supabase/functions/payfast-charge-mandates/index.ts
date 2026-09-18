// Daily job: charges every active monthly PayFast card arrangement that is due
// today (or overdue). Each charge is recorded as a collection row, charged
// against the saved card token, and — on success — posted to the club's books
// through the shared PayFast settlement path.
//
// Idempotent: one collection row per (mandate, due_date), enforced by a unique
// index, and settlement only runs when this caller claims the payment session.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveGatewayCreds } from "../_shared/gateway-creds.ts";
import { isSandboxCreds } from "../_shared/payfast.ts";
import { nextChargeDate, pfAdhocCharge } from "../_shared/payfast-recurring.ts";
import { claimPayfastSession, settlePayfastSession } from "../_shared/payfast-settlement.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_CONSECUTIVE_FAILURES = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const restrictClubId: string | null = body?.club_id || null;
    const onlyMandateId: string | null = body?.mandate_id || null;
    const today = new Date().toISOString().slice(0, 10);

    let q = admin
      .from("stitch_mandates")
      .select("*")
      .eq("gateway", "payfast")
      .eq("status", "active")
      .not("payfast_token", "is", null)
      .lte("next_charge_date", today);
    if (restrictClubId) q = q.eq("club_id", restrictClubId);
    if (onlyMandateId) q = q.eq("id", onlyMandateId);

    const { data: mandates, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const credsCache = new Map<string, Record<string, string>>();
    const results: Array<Record<string, unknown>> = [];

    for (const m of mandates || []) {
      const dueDate = String(m.next_charge_date || today);
      const amount = Number(m.max_amount_cents || 0) / 100;
      if (!(amount > 0)) continue;

      // Finished plans stop themselves.
      if (m.months_total && Number(m.months_charged || 0) >= Number(m.months_total)) {
        await admin
          .from("stitch_mandates")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString(), next_charge_date: null })
          .eq("id", m.id);
        results.push({ mandate: m.id, skipped: "plan complete" });
        continue;
      }

      // Idempotency: one collection per mandate per due date.
      const { data: collection, error: colErr } = await admin
        .from("stitch_collections")
        .insert({
          club_id: m.club_id,
          mandate_id: m.id,
          club_member_id: m.club_member_id,
          amount_cents: m.max_amount_cents,
          due_date: dueDate,
          status: "submitted",
          approval_required: false,
          gateway: "payfast",
          submitted_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (colErr || !collection) {
        results.push({ mandate: m.id, skipped: colErr?.message || "already collected" });
        continue;
      }

      let creds = credsCache.get(m.club_id);
      if (!creds) {
        const { data: secrets } = await admin
          .from("club_secrets")
          .select("payment_gateway_credentials")
          .eq("club_id", m.club_id)
          .maybeSingle();
        creds = resolveGatewayCreds(secrets?.payment_gateway_credentials, "payfast");
        credsCache.set(m.club_id, creds);
      }
      const merchantId = (creds.merchant_id || "").trim();
      if (!merchantId) {
        await admin
          .from("stitch_collections")
          .update({ status: "failed", failed_reason: "PayFast credentials missing" })
          .eq("id", collection.id);
        results.push({ mandate: m.id, failed: "no credentials" });
        continue;
      }

      const { data: club } = await admin
        .from("clubs")
        .select("name, currency_code")
        .eq("id", m.club_id)
        .maybeSingle();

      const { data: session } = await admin
        .from("payfast_payment_sessions")
        .insert({
          club_id: m.club_id,
          club_member_id: m.club_member_id,
          user_id: m.user_id,
          amount,
          currency: (club as any)?.currency_code || "ZAR",
          purpose: "topup",
          description: "Monthly card payment",
          status: "created",
          mandate_id: m.id,
        })
        .select("*")
        .single();

      const charge = await pfAdhocCharge({
        token: m.payfast_token,
        merchantId,
        passphrase: creds.passphrase,
        sandbox: isSandboxCreds(creds),
        amount,
        itemName: `${club?.name || "Club"} — monthly fees`,
        reference: session?.id || `${m.id}-${dueDate}`,
      });

      if (charge.ok && session) {
        await admin
          .from("payfast_payment_sessions")
          .update({ payfast_payment_id: charge.paymentId })
          .eq("id", session.id);
        if (await claimPayfastSession(admin, session.id)) {
          await settlePayfastSession(admin, { ...session, payfast_payment_id: charge.paymentId });
        }
        await admin
          .from("stitch_collections")
          .update({
            status: "paid",
            settled_at: new Date().toISOString(),
            posted_at: new Date().toISOString(),
            payfast_payment_id: charge.paymentId,
          })
          .eq("id", collection.id);
        await admin
          .from("stitch_mandates")
          .update({
            last_collection_at: new Date().toISOString(),
            consecutive_failures: 0,
            last_failure_reason: null,
            months_charged: Number(m.months_charged || 0) + 1,
            next_charge_date: nextChargeDate(Number(m.debit_day) || 1, new Date()),
            updated_at: new Date().toISOString(),
          })
          .eq("id", m.id);
        results.push({ mandate: m.id, paid: amount });
      } else {
        if (session) {
          await admin
            .from("payfast_payment_sessions")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("id", session.id)
            .neq("status", "completed");
        }
        await admin
          .from("stitch_collections")
          .update({ status: "failed", failed_reason: charge.message.slice(0, 500) })
          .eq("id", collection.id);

        const failures = Number(m.consecutive_failures || 0) + 1;
        const giveUp = failures >= MAX_CONSECUTIVE_FAILURES;
        await admin
          .from("stitch_mandates")
          .update({
            consecutive_failures: failures,
            last_failure_reason: charge.message.slice(0, 500),
            suspended_at: giveUp ? new Date().toISOString() : m.suspended_at,
            status: giveUp ? "failed" : m.status,
            // Retry in three days, up to the failure limit.
            next_charge_date: giveUp
              ? null
              : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            updated_at: new Date().toISOString(),
          })
          .eq("id", m.id);
        results.push({ mandate: m.id, failed: charge.message });
      }
    }

    return json({ processed: results.length, results });
  } catch (e: any) {
    console.error("payfast-charge-mandates error:", e);
    return json({ error: e.message || "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
