/**
 * Splits a tournament's games into Upcoming Fixtures vs Results — each game in exactly one list.
 * Upcoming: not played yet (scheduled/unscheduled/in progress). Results: completed/finalised scores,
 * walkovers/forfeits, byes and cancelled/void games (labelled by the row renderer).
 */
export type SplitMatch = { status?: string | null; is_bye?: boolean | null; winner_member_id?: string | null };
const CLOSED = new Set(["completed", "cancelled", "walkover_void", "void", "forfeit", "walkover"]);
export const isResultMatch = (m: SplitMatch) => !!m.is_bye || CLOSED.has(String(m.status ?? "")) || (!!m.winner_member_id && m.status !== "in_progress");
export const isUpcomingMatch = (m: SplitMatch) => !isResultMatch(m);
export function splitFixtures<T extends SplitMatch>(list: T[]) {
  const upcoming: T[] = [], results: T[] = [];
  for (const m of list) (isResultMatch(m) ? results : upcoming).push(m);
  return { upcoming, results };
}
export type TournamentTab = "standings" | "upcoming" | "results";
export const tabFromParam = (v: string | null | undefined): TournamentTab =>
  v === "upcoming" || v === "fixtures" ? "upcoming" : v === "results" ? "results" : "standings";

/**
 * Swiss progressive-lock rule: a Swiss slot is only a real fixture once BOTH players are known.
 * Unresolved slots (e.g. "#1 vs #12" / TBD) stay out of Upcoming Fixtures and the calendar even if a
 * date/court/time is already assigned; they appear automatically once the pairing is filled in.
 */
export type SwissSlotLike = { is_bye?: boolean | null; player_a_member_id?: string | null; player_b_member_id?: string | null; stage?: string | null; stage_key?: string | null };
export const isSwissMatch = (m: SwissSlotLike, champ?: { scoring_mode?: string | null } | null) =>
  champ?.scoring_mode === "swiss" || /swiss/i.test(String(m.stage_key ?? "")) || /swiss/i.test(String(m.stage ?? ""));
export const isProvisionalSwissSlot = (m: SwissSlotLike, champ?: { scoring_mode?: string | null } | null) =>
  !m.is_bye && isSwissMatch(m, champ) && (!m.player_a_member_id || !m.player_b_member_id);
