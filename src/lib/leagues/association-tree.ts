/**
 * Association-level league tree.
 *
 * An association (e.g. NSA) does not own its members' teams — every team row
 * belongs to an affiliated club. This module turns the flat team list returned
 * by `association_league_teams` into a two-level tree that can be grouped
 * either by league level (default) or by club, plus a plain-text search.
 *
 * Pure functions only: no Supabase, no React.
 */
import { isReserveLeague, levelFromName } from "@/lib/tournaments/league-tree";

export type AssocTeam = {
  team_id: string;
  team_name: string;
  team_code: string | null;
  level: number | null;
  is_reserve: boolean;
  category: string | null;
  season_year: number | null;
  club_id: string;
  club_name: string;
  created_by_association: boolean;
  player_count: number;
};

export type AssocTreeNode = {
  key: string;
  label: string;
  /** Present when the node is a club group. */
  clubId?: string;
  teams: AssocTeam[];
  teamCount: number;
  playerCount: number;
};

export type GroupMode = "level" | "club";

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

export function levelLabel(level: number | null): string {
  if (level == null) return "Needs league assignment";
  return `${ORDINALS[level] ?? `${level}th`} League`;
}

/** Level of a team: explicit column first, then a guess from its name. */
export function teamLevel(t: AssocTeam): number | null {
  if (t.level != null) return t.level;
  return levelFromName(t.team_name);
}

export function isReserveTeam(t: AssocTeam): boolean {
  return t.is_reserve || isReserveLeague(t.team_name);
}

const sortTeams = (a: AssocTeam, b: AssocTeam) => {
  const ra = isReserveTeam(a) ? 1 : 0;
  const rb = isReserveTeam(b) ? 1 : 0;
  if (ra !== rb) return ra - rb;
  return a.club_name.localeCompare(b.club_name) || a.team_name.localeCompare(b.team_name);
};

/** Group teams by league level, unplaceable ones last under one bucket. */
export function groupByLevel(teams: AssocTeam[]): AssocTreeNode[] {
  const map = new Map<string, AssocTreeNode>();
  for (const t of teams) {
    const lvl = teamLevel(t);
    const key = lvl == null ? "none" : `lvl-${lvl}`;
    let node = map.get(key);
    if (!node) {
      node = { key, label: levelLabel(lvl), teams: [], teamCount: 0, playerCount: 0 };
      map.set(key, node);
    }
    node.teams.push(t);
  }
  return finalize(
    [...map.values()].sort((a, b) => {
      if (a.key === "none") return 1;
      if (b.key === "none") return -1;
      return Number(a.key.slice(4)) - Number(b.key.slice(4));
    })
  );
}

/** Group teams by owning club, alphabetically. */
export function groupByClub(teams: AssocTeam[]): AssocTreeNode[] {
  const map = new Map<string, AssocTreeNode>();
  for (const t of teams) {
    let node = map.get(t.club_id);
    if (!node) {
      node = { key: t.club_id, label: t.club_name, clubId: t.club_id, teams: [], teamCount: 0, playerCount: 0 };
      map.set(t.club_id, node);
    }
    node.teams.push(t);
  }
  return finalize([...map.values()].sort((a, b) => a.label.localeCompare(b.label)));
}

function finalize(nodes: AssocTreeNode[]): AssocTreeNode[] {
  for (const n of nodes) {
    n.teams.sort(sortTeams);
    n.teamCount = n.teams.length;
    n.playerCount = n.teams.reduce((s, t) => s + (t.player_count || 0), 0);
  }
  return nodes;
}

export function buildAssocTree(teams: AssocTeam[], mode: GroupMode): AssocTreeNode[] {
  return mode === "club" ? groupByClub(teams) : groupByLevel(teams);
}

/** Search across club name, team name and team code. Empty query = unchanged. */
export function filterAssocTree(nodes: AssocTreeNode[], query: string): AssocTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const out: AssocTreeNode[] = [];
  for (const n of nodes) {
    if (n.label.toLowerCase().includes(q)) {
      out.push(n);
      continue;
    }
    const teams = n.teams.filter(
      (t) =>
        t.team_name.toLowerCase().includes(q) ||
        t.club_name.toLowerCase().includes(q) ||
        (t.team_code || "").toLowerCase().includes(q)
    );
    if (teams.length) out.push(finalize([{ ...n, teams }])[0]);
  }
  return out;
}

/** Seasons present in the data, newest first. `null` season stays out. */
export function seasonsOf(teams: AssocTeam[]): number[] {
  return [...new Set(teams.map((t) => t.season_year).filter((y): y is number => y != null))].sort((a, b) => b - a);
}

/** Affiliated clubs that have not submitted a single team for the selection. */
export function clubsWithoutTeams(
  clubs: { id: string; name: string }[],
  teams: AssocTeam[]
): { id: string; name: string }[] {
  const have = new Set(teams.map((t) => t.club_id));
  return clubs.filter((c) => !have.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
}

export function summarize(teams: AssocTeam[]): string {
  const clubs = new Set(teams.map((t) => t.club_id)).size;
  const players = teams.reduce((s, t) => s + (t.player_count || 0), 0);
  return `${clubs} club${clubs === 1 ? "" : "s"} · ${teams.length} team${teams.length === 1 ? "" : "s"} · ${players} player${players === 1 ? "" : "s"}`;
}
