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
 *   - Allowed debt:
 *       • Active authorised monthly Stitch mandate → allowed debt = ALL outstanding fees.
 *       • No mandate yet → allowed debt = outstanding CLUB MEMBERSHIP fees only.
 *         (Members can carry their membership balance, but must still keep the court-fee
 *         buffer on top for a booking.)
 *   - Member passes if:   currentOwing - planAllowedDebt + requiredBuffer  ≤  0
 */

export async function checkBookingBalance(opts: {
  clubMemberId: string;
  clubId: string;
  minBookingBalance: number | null | undefined;
}): Promise<BookingBalanceResult> {
  // Always fetch the club's current min_booking_balance fresh — the cached
  // `myClub` in React Query can lag behind admin changes and cause the gate
  // to silently skip.
  let buffer: number | null | undefined = opts.minBookingBalance;
  try {
    const { data: clubRow } = await (supabase as any)
      .from("clubs")
      .select("min_booking_balance")
      .eq("id", opts.clubId)
      .maybeSingle();
    if (clubRow) buffer = clubRow.min_booking_balance;
  } catch (e) {
    console.warn("[booking-balance] club fetch failed, falling back to prop:", e);
  }

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

  // 2. Allowed debt = outstanding membership fees (always) + all outstanding fees if an
  //    authorised monthly arrangement exists. This means until debit-order arrangements
  //    are set up, a member is allowed to sit at "minus their outstanding membership fee"
  //    on their account and still book — they just need the minimum court-fee buffer on top.
  //
  //    Outstanding fee rows SHRINK as payments are made (each instalment reduces
  //    the fee it settles), so the allowance is effectively
  //    "season fees − payments made" — paying R100 moves the requirement by R100.
  //    Linked family fees (raised on a family member's account with this member
  //    as payer) count towards the arrangement too.
  const { data: mandate } = await (supabase as any)
    .from("stitch_mandates")
    .select("id")
    .eq("club_member_id", opts.clubMemberId)
    .eq("status", "active")
    .eq("frequency", "monthly")
    .is("suspended_at", null)
    .maybeSingle();

  const { data: fees } = await (supabase as any)
    .from("club_member_fee_payments")
    .select("amount, fee_type")
    .eq("paid", false)
    .or(`club_member_id.eq.${opts.clubMemberId},paid_by_member_id.eq.${opts.clubMemberId}`);

  let planAllowedDebt = 0;
  if (mandate) {
    // Active monthly arrangement → ALL outstanding fees may be carried.
    planAllowedDebt = (fees || []).reduce((s: number, f: any) => s + Number(f.amount || 0), 0);
  } else {
    // No arrangement yet — allow the outstanding membership portion only.
    // Fee types used across the app: 'membership', 'club_membership' and 'club'
    // (club membership fees, incl. family package lines, are stored as 'club').
    planAllowedDebt = (fees || [])
      .filter((f: any) => ["membership", "club_membership", "club"].includes(f.fee_type ?? ""))
      .reduce((s: number, f: any) => s + Number(f.amount || 0), 0);
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

