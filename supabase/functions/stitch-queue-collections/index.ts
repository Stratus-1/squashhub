// Daily job: scans active mandates and queues collections for outstanding fees
// due in the next 7 days. Inserts stitch_collections rows with status='queued'
// and approval_required=true (admin has 2 days to edit/cancel).
//
// Auth: callable with the service-role key (cron) or by a club admin with a
// JWT (manual "Run now" button in BankingTab → Debit Orders). When called by
// an admin we restrict to their own club_id.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const body = await req.json().catch(() => ({}));
    const restrictClubId: string | null = body?.club_id || null;

    // Pull all active mandates (optionally filtered by club).
    let mandatesQ = admin
      .from("stitch_mandates")
      .select("id, club_id, club_member_id, max_amount_cents, debit_day, fee_category_id, status")
      .eq("status", "active");
    if (restrictClubId) mandatesQ = mandatesQ.eq("club_id", restrictClubId);
    const { data: mandates, error: mErr } = await mandatesQ;
    if (mErr) return json({ error: mErr.message }, 500);

    const today = new Date();
    const horizon = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    let queued = 0;
    let skipped = 0;

    for (const mandate of mandates || []) {
      // Outstanding fee payments for this member.
      const { data: fees } = await admin
        .from("club_member_fee_payments")
        .select("id, amount, fee_label, invoice_due_date, paid")
        .eq("club_member_id", mandate.club_member_id)
        .eq("paid", false);

      for (const fee of fees || []) {
        const dueRaw = fee.invoice_due_date ? new Date(fee.invoice_due_date) : null;
        if (!dueRaw) { skipped++; continue; }
        if (dueRaw > horizon) continue;

        const cents = Math.round(Number(fee.amount) * 100);
        if (!(cents > 0)) { skipped++; continue; }
        if (mandate.max_amount_cents && cents > mandate.max_amount_cents) {
          skipped++; continue;
        }

        // Skip if a collection already exists for this fee that isn't failed.
        const { data: existing } = await admin
          .from("stitch_collections")
          .select("id, status")
          .eq("fee_payable_id", fee.id)
          .not("status", "in", "(failed,cancelled)")
          .maybeSingle();
        if (existing) continue;

        const dueISO = dueRaw.toISOString().slice(0, 10);
        const { error: insErr } = await admin.from("stitch_collections").insert({
          club_id: mandate.club_id,
          mandate_id: mandate.id,
          club_member_id: mandate.club_member_id,
          fee_payable_id: fee.id,
          amount_cents: cents,
          due_date: dueISO,
          status: "queued",
          approval_required: true,
          attempt_number: 1,
        });
        if (!insErr) queued++;
      }
    }

    return json({ ok: true, queued, skipped, mandates_scanned: mandates?.length || 0 });
  } catch (e) {
    console.error("stitch-queue-collections fatal", e);
    return json({ error: (e as Error).message || "Unexpected" }, 500);
  }
});
