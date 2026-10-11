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
