/**
 * "My fixtures" — pure helpers shared by the member dashboard (My Tournaments)
 * and the Tournament Games page. Identity is a set of canonical club_member
 * ids that all belong to the SAME person (home club row + any other club rows
 * linked through people.person_id). Never email-based.
 */

export type FixtureLike = {
  id: string;
  champ_id?: string | null;
  status?: string | null;
  is_bye?: boolean | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  player_a_member_id?: string | null;
  partner_a_member_id?: string | null;
  player_b_member_id?: string | null;
  partner_b_member_id?: string | null;
  winner_member_id?: string | null;
};

const toSet = (ids: Iterable<string | null | undefined>) => {
  const s = new Set<string>();
  for (const id of ids) if (id) s.add(id);
  return s;
};

/** Which side the person plays on, or null when not involved. */
export function mySide(m: FixtureLike, ids: Iterable<string | null | undefined>): "a" | "b" | null {
  const s = toSet(ids);
  if (s.size === 0) return null;
  if ((m.player_a_member_id && s.has(m.player_a_member_id)) || (m.partner_a_member_id && s.has(m.partner_a_member_id))) return "a";
  if ((m.player_b_member_id && s.has(m.player_b_member_id)) || (m.partner_b_member_id && s.has(m.partner_b_member_id))) return "b";
  return null;
}

export const involvesMe = (m: FixtureLike, ids: Iterable<string | null | undefined>) => mySide(m, ids) !== null;

export const isCompletedFixture = (m: FixtureLike) => m.status === "completed";

/** Upcoming = not completed/cancelled/bye and not dated in the past. */
export function isUpcomingFixture(m: FixtureLike, today: string): boolean {
  if (m.is_bye) return false;
  if (m.status === "completed" || m.status === "cancelled" || m.status === "walkover_void") return false;
  return !m.scheduled_date || m.scheduled_date >= today;
}

const sortKey = (m: FixtureLike) => `${m.scheduled_date || "9999-12-31"} ${m.scheduled_time || "23:59:59"}`;

/** The person's fixtures, earliest first (undated last). */
export function selectMyFixtures<T extends FixtureLike>(
  matches: T[],
  ids: Iterable<string | null | undefined>,
  opts: { today: string; includeCompleted?: boolean },
): T[] {
  const s = toSet(ids);
  if (s.size === 0) return [];
  return matches
    .filter((m) => involvesMe(m, s))
    .filter((m) => (opts.includeCompleted ? !m.is_bye : isUpcomingFixture(m, opts.today)))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || String(a.id).localeCompare(String(b.id)));
}

/** Win/loss for the person, correct for doubles (winner may be either partner). */
export function myRecord(matches: FixtureLike[], ids: Iterable<string | null | undefined>) {
  const s = toSet(ids);
  let w = 0, l = 0;
  for (const m of matches) {
    if (!isCompletedFixture(m) || !m.winner_member_id) continue;
    const side = mySide(m, s);
    if (!side) continue;
    const winA = m.winner_member_id === m.player_a_member_id || m.winner_member_id === m.partner_a_member_id;
    const winB = m.winner_member_id === m.player_b_member_id || m.winner_member_id === m.partner_b_member_id;
    if ((side === "a" && winA) || (side === "b" && winB)) w++;
    else if (winA || winB) l++;
  }
  return { w, l };
}

export type TournamentScheduleState = "upcoming" | "not_scheduled" | "finished";

/** Card empty state: no fixtures at all yet vs all of mine are played. */
export function myScheduleState(myAll: FixtureLike[], today: string): TournamentScheduleState {
  if (myAll.some((m) => isUpcomingFixture(m, today))) return "upcoming";
  if (myAll.length === 0) return "not_scheduled";
  return "finished";
}

export const myFixturesHref = (champId: string) => `/tournaments?champ=${encodeURIComponent(champId)}&mine=1`;
