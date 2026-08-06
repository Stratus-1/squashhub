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
      .select("id, club_id, club_member_id, max_amount_cents, debit_day, fee_category_id, status, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (restrictClubId) mandatesQ = mandatesQ.eq("club_id", restrictClubId);
    const { data: allMandates, error: mErr } = await mandatesQ;
    if (mErr) return json({ error: mErr.message }, 500);

    // Safety net: only ever bill ONE mandate per member (the most recent active
    // one). A DB trigger enforces this too, but legacy rows could still exist.
    const seenMembers = new Set<string>();
    const mandates = (allMandates || []).filter((m: any) => {
      if (seenMembers.has(m.club_member_id)) return false;
      seenMembers.add(m.club_member_id);
      return true;
    });


    // Build per-club eligible fee-label lookups: only fees with debit_order_eligible=true
    // are auto-queued. We match by fee_label (since club_member_fee_payments holds free-text
    // labels rather than a FK to the source fee row).
    const clubIds = Array.from(new Set((mandates || []).map((m: any) => m.club_id)));
    const eligibleByClub: Record<string, Set<string>> = {};
    for (const cid of clubIds) {
      const set = new Set<string>();
      const [cats, assocs, nats] = await Promise.all([
        admin.from("member_fee_categories").select("name").eq("club_id", cid).eq("debit_order_eligible", true),
        admin.from("league_associations").select("name, abbreviation").eq("club_id", cid).eq("debit_order_eligible", true),
        admin.from("national_body_fees").select("body_name, abbreviation").eq("club_id", cid).eq("debit_order_eligible", true),
      ]);
      (cats.data || []).forEach((r: any) => { if (r.name) set.add(String(r.name).toLowerCase()); });
      (assocs.data || []).forEach((r: any) => {
        if (r.name) set.add(String(r.name).toLowerCase());
        if (r.abbreviation) set.add(String(r.abbreviation).toLowerCase());
      });
      (nats.data || []).forEach((r: any) => {
        if (r.body_name) set.add(String(r.body_name).toLowerCase());
        if (r.abbreviation) set.add(String(r.abbreviation).toLowerCase());
      });
      eligibleByClub[cid] = set;
    }

    const today = new Date();
    const horizon = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    let queued = 0;
    let skipped = 0;
    let skippedIneligible = 0;

    for (const mandate of mandates || []) {
      // Outstanding fee payments for this member.
      const { data: fees } = await admin
        .from("club_member_fee_payments")
        .select("id, amount, fee_label, invoice_due_date, paid")
        .eq("club_member_id", mandate.club_member_id)
        .eq("paid", false);

      const eligibleSet = eligibleByClub[mandate.club_id] || new Set<string>();

      // Keep only fees this club marked as debit-order eligible.
      const eligibleFees = (fees || []).filter((fee: any) => {
        const lbl = String(fee.fee_label || "").toLowerCase();
        const ok = Array.from(eligibleSet).some((n) => lbl.includes(n));
        if (!ok) skippedIneligible++;
        return ok;
      }).filter((fee: any) => Math.round(Number(fee.amount) * 100) > 0);

      if (!eligibleFees.length) continue;

      // This month's debit date, from the mandate's chosen debit day.
      const day = Number(mandate.debit_day) || 1;
      const lastDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
      let dueRaw = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), Math.min(day, lastDay)));
      const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      if (dueRaw < todayUTC) {
        const nm = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
        const nmLast = new Date(Date.UTC(nm.getUTCFullYear(), nm.getUTCMonth() + 2, 0)).getUTCDate();
        dueRaw = new Date(Date.UTC(nm.getUTCFullYear(), nm.getUTCMonth(), Math.min(day, nmLast)));
      }
      if (dueRaw > horizon) continue;

      const monthStart = new Date(Date.UTC(dueRaw.getUTCFullYear(), dueRaw.getUTCMonth(), 1))
        .toISOString().slice(0, 10);
      const monthEnd = new Date(Date.UTC(dueRaw.getUTCFullYear(), dueRaw.getUTCMonth() + 1, 0))
        .toISOString().slice(0, 10);

      // One instalment per MEMBER per calendar month (regardless of which
      // mandate queued it) so duplicate mandates can never double-bill.
      const { data: already } = await admin
        .from("stitch_collections")
        .select("id")
        .eq("club_member_id", mandate.club_member_id)
        .gte("due_date", monthStart)
        .lte("due_date", monthEnd)
        .not("status", "in", "(failed,skipped)")
        .limit(1);
      if (already && already.length) continue;


      // Amount still owing across eligible fees, minus anything already
      // queued/submitted/paid against them (partial instalments).
      const feeIds = eligibleFees.map((f: any) => f.id);
      const { data: prior } = await admin
        .from("stitch_collections")
        .select("fee_payable_id, amount_cents, status")
        .in("fee_payable_id", feeIds)
        .not("status", "in", "(failed,skipped)");
      const collectedByFee: Record<string, number> = {};
      (prior || []).forEach((c: any) => {
        if (!c.fee_payable_id) return;
        collectedByFee[c.fee_payable_id] = (collectedByFee[c.fee_payable_id] || 0) + Number(c.amount_cents || 0);
      });

      // Oldest fee first so instalments settle one fee before moving on.
      eligibleFees.sort((a: any, b: any) =>
        String(a.invoice_due_date || "9999-12-31").localeCompare(String(b.invoice_due_date || "9999-12-31")));

      let budget = Number(mandate.max_amount_cents) || 0;
      if (!(budget > 0)) { skipped++; continue; }
      const dueISO = dueRaw.toISOString().slice(0, 10);
      let queuedForMandate = 0;

      for (const fee of eligibleFees) {
        if (budget <= 0) break;
        const total = Math.round(Number(fee.amount) * 100);
        const remaining = total - (collectedByFee[fee.id] || 0);
        if (remaining <= 0) continue;
        const amount = Math.min(remaining, budget);
        const { error: insErr } = await admin.from("stitch_collections").insert({
          club_id: mandate.club_id,
          mandate_id: mandate.id,
          club_member_id: mandate.club_member_id,
          fee_payable_id: fee.id,
          amount_cents: amount,
          due_date: dueISO,
          // Auto-approved: no admin approval step. Admins can still cancel a
          // collection before its due date from the Recurring Card Payments panel.
          status: "approved",
          approved_at: new Date().toISOString(),
          approval_required: false,
          attempt_number: 1,
        });
        if (!insErr) { queued++; queuedForMandate++; budget -= amount; }
      }
      if (!queuedForMandate) skipped++;
    }


    return json({ ok: true, queued, skipped, skipped_ineligible: skippedIneligible, mandates_scanned: mandates?.length || 0 });
  } catch (e) {
    console.error("stitch-queue-collections fatal", e);
    return json({ error: (e as Error).message || "Unexpected" }, 500);
  }
});
