/**
 * Visitor fee payable immediately (club switch `visitor_fee_prepay_required`).
 * The booking screen asks the server whether the fee must be paid by card first
 * only for a member's booking that names a visitor instead of a member opponent.
 * The server (`visitor_fee_booking_check` + booking trigger) is the authority.
 */
export function visitorFeeCheckApplies(opts: {
  isVisitorRole: boolean;
  playerMode: string | null | undefined;
  guestName: string | null | undefined;
  opponentId: string | null | undefined;
  prepayRequired: boolean | null | undefined;
  visitorFee: number;
}): boolean {
  if (opts.isVisitorRole) return false;
  if (!opts.prepayRequired || !(opts.visitorFee > 0)) return false;
  if (opts.playerMode !== "visitor" && opts.playerMode !== "guest") return false;
  if (opts.opponentId) return false;
  return !!String(opts.guestName || "").trim();
}
