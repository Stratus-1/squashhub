/**
 * Who may appear in the court-booking player pickers.
 *
 * Visitors feature NOWHERE in booking selection unless they hold a live
 * (active, in-window, paid or club-approved free) day / 3-day / month visitor
 * pass. The authoritative check is the `club_bookable_visitors` RPC, which
 * reuses `has_active_visitor_pass` in the database; this helper only mirrors
 * that decision for lists the client already has.
 */
export function isVisitorWithoutLivePass(
  role: string | null | undefined,
  memberId: string,
  livePassHolderIds: ReadonlySet<string>,
): boolean {
  return String(role || "").toLowerCase() === "visitor" && !livePassHolderIds.has(memberId);
}
