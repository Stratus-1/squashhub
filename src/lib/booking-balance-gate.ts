import { supabase } from "@/integrations/supabase/client";

export type BookingBalanceResult = {
  allowed: boolean;
  shortfall: number; // R amount short (0 if allowed)
  currentOwing: number; // positive = owes, negative = in credit
  planAllowedDebt: number;
  requiredBuffer: number;
  approvedCredit?: number;
  effectiveAvailableBalance?: number;
  reason?: string;
};

/**
 * Pure gate maths, exported for tests.
 *
 * One rule for every club:
 *   allowance = outstanding fees covered by an active recurring arrangement
 *               (no arrangement → no allowance)
 *   shortfall = balance owing − arrangement allowance − approved credit + booking float
 *
 * Positive shortfall = the member must pay that much before booking.
 */
export function computeBookingGate(opts: {
  currentOwing: number;
  fees: { amount: number; fee_type?: string | null }[];
  hasMandate: boolean;
  buffer: number;
  approvedCredit?: number;
}): { planAllowedDebt: number; shortfall: number } {
  const { currentOwing, fees, hasMandate, buffer } = opts;
  const planAllowedDebt = hasMandate
    ? fees.reduce((s, f) => s + Number(f.amount || 0), 0)
    : 0;
  return { planAllowedDebt, shortfall: Math.round((currentOwing - planAllowedDebt - (opts.approvedCredit ?? 0) + buffer) * 100) / 100 };
}

/** Server-authoritative, club-scoped eligibility; pending charges are included once. */
export async function checkBookingBalance(opts: {
  clubMemberId: string;
  clubId: string;
  minBookingBalance: number | null | undefined;
  pendingCharge?: number;
}): Promise<BookingBalanceResult> {
  const { data, error } = await supabase.rpc("member_booking_eligibility", {
    _club_id: opts.clubId,
    _club_member_id: opts.clubMemberId,
    _extra: opts.pendingCharge ?? 0,
  });
  if (error) throw error;
  return data as unknown as BookingBalanceResult;
}
