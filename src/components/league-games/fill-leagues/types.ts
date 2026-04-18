export type LeagueRow = {
  id: string;
  name: string;
  code: string | null;
  captain_member_id: string | null;
  allow_cross_gender_guests: boolean | null;
};

export type RegRow = {
  id: string;
  club_member_id: string;
  league_id: string;
  player_rank: number | null;
  is_captain: boolean | null;
  league_association_number: string | null;
  ssa_number: string | null;
};

export type StatusRow = {
  id: string;
  league_id: string;
  club_member_id: string;
  status: "playing" | "unavailable" | "excess";
  cascaded_from_league_id: string | null;
};

export type LineupRow = {
  id: string;
  league_id: string;
  position: number;
  club_member_id: string;
};

export type MemberLite = {
  id: string;
  name: string | null;
  gender: string | null;
  ladder_position: number | null;
};

export type FixtureLite = {
  id: string;
  fixture_date: string;
  venue_name: string;
  home_team_code: string;
  away_team_code: string;
};

/**
 * DnD identifier conventions
 *  - draggable id: `player:{memberId}:{originLeagueId|na|pool}`
 *  - droppable id:
 *      - `pos:{leagueId}:{1..4}`     — position slot
 *      - `bench:{leagueId}`          — league bench (cascade target)
 *      - `na`                        — week-wide not-available zone
 */
export const dragId = (memberId: string, origin: string) => `player:${memberId}:${origin}`;
export const parseDragId = (id: string): { memberId: string; origin: string } | null => {
  const [p, m, o] = id.split(":");
  if (p !== "player" || !m) return null;
  return { memberId: m, origin: o ?? "" };
};

export const posDropId = (leagueId: string, position: number) => `pos:${leagueId}:${position}`;
export const benchDropId = (leagueId: string) => `bench:${leagueId}`;
export const naDropId = "na";

export const parseDropId = (id: string):
  | { kind: "pos"; leagueId: string; position: number }
  | { kind: "bench"; leagueId: string }
  | { kind: "na" }
  | null => {
  if (id === naDropId) return { kind: "na" };
  const parts = id.split(":");
  if (parts[0] === "pos" && parts[1] && parts[2]) return { kind: "pos", leagueId: parts[1], position: parseInt(parts[2], 10) };
  if (parts[0] === "bench" && parts[1]) return { kind: "bench", leagueId: parts[1] };
  return null;
};
