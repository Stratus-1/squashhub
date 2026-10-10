/**
 * Bye side — one rule for every screen that shows a fixture.
 *
 * An odd-sized pool leaves one player without an opponent. The draw stores that
 * as a normal fixture row with only one side filled in; the `is_bye` column is
 * not always set (the engine pushes `[bye, null]` pairs straight through). So a
 * row that has exactly one side filled and no placeholder text IS a bye, and
 * must read "BYE" — never "Unknown", "TBD" or "TBC".
 *
 * Presentation only: this never changes what is stored, and it never turns a
 * genuinely empty slot ("Empty slot", "Winner Pool A", a bracket awaiting
 * feeders) into a bye — those carry placeholder text or have no opponent either.
 */
export function isByeFixture(m: any): boolean {
  if (!m) return false;
  if (m.is_bye) return true;
  if (m.placeholder_a || m.placeholder_b) return false;
  const a = Boolean(m.player_a_member_id);
  const b = Boolean(m.player_b_member_id);
  // Exactly one side filled = the other side sits out this round.
  return a !== b;
}

/** The label for a side with no player: "BYE" for a bye, otherwise the caller's fallback. */
export function byeLabel(isBye: boolean, fallback = ""): string {
  return isBye ? "BYE" : fallback;
}
