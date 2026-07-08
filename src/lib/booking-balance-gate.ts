import { supabase } from "@/integrations/supabase/client";

export type BookingBalanceResult = {
  allowed: boolean;
  shortfall: number; // R amount short (0 if allowed)
  currentOwing: number; // positive = owes, negative = in credit
  planAllowedDebt: number;
  requiredBuffer: number;
  reason?: string;
};

/**
 * Check whether a member has sufficient account balance to make a court booking.
 *
 * Rules:
 *   - If `minBookingBalance` is null/undefined → always allowed.
 *   - Compute current owing from GL: sum(debit - credit) on `debtors` + `member_credits`
 *     for the member. Positive = owes, negative = in credit.
 *   - If the member has an active (authorised) monthly Stitch mandate we treat their
 *     current outstanding fees as "on an arranged monthly plan" — so their allowed
 *     debt equals that outstanding. Otherwise allowed debt is 0.
 *   - Member passes if:   currentOwing - planAllowedDebt + requiredBuffer  ≤  0
 *     (i.e. they still have at least `requiredBuffer` credit above their allowed debt line)
 */
export async function checkBookingBalance(opts: {
  clubMemberId: string;
  clubId: string;
  minBookingBalance: number | null | undefined;
}): Promise<BookingBalanceResult> {
  const buffer = opts.minBookingBalance;
  if (buffer === null || buffer === undefined) {
    return {
      allowed: true,
      shortfall: 0,
      currentOwing: 0,
      planAllowedDebt: 0,
      requiredBuffer: 0,
    };
  }

  // 1. Current owing from GL
  const { data: journalRows, error: journalErr } = await (supabase as any)
    .from("club_journal_entries")
    .select("debit, credit, account")
    .eq("club_member_id", opts.clubMemberId)
    .in("account", ["debtors", "member_credits"]);

  if (journalErr) {
    console.error("[booking-balance] journal fetch failed:", journalErr);
    // Fail open so a transient DB error doesn't block bookings.
    return {
      allowed: true,
      shortfall: 0,
      currentOwing: 0,
      planAllowedDebt: 0,
      requiredBuffer: buffer,
    };
  }

  const currentOwing = (journalRows || []).reduce(
    (sum: number, r: any) => sum + Number(r.debit || 0) - Number(r.credit || 0),
    0,
  );

  // 2. Active monthly payment arrangement?
  const { data: mandate } = await (supabase as any)
    .from("stitch_mandates")
    .select("id")
    .eq("club_member_id", opts.clubMemberId)
    .eq("status", "authorised")
    .eq("frequency", "monthly")
    .maybeSingle();

  let planAllowedDebt = 0;
  if (mandate) {
    const { data: fees } = await (supabase as any)
      .from("club_member_fee_payments")
      .select("amount")
      .eq("club_member_id", opts.clubMemberId)
      .eq("paid", false);
    planAllowedDebt = (fees || []).reduce((s: number, f: any) => s + Number(f.amount || 0), 0);
  }

  const shortfall = currentOwing - planAllowedDebt + buffer;
  return {
    allowed: shortfall <= 0,
    shortfall: shortfall > 0 ? Math.round(shortfall * 100) / 100 : 0,
    currentOwing: Math.round(currentOwing * 100) / 100,
    planAllowedDebt: Math.round(planAllowedDebt * 100) / 100,
    requiredBuffer: buffer,
  };
}
