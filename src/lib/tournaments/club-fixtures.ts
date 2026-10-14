/**
 * Club-wide fixtures (Riverside pilot, read-only). Normalises the SAME saved
 * matches the Tournaments page already loads (and keeps live via realtime) —
 * no second scoring engine, no invented dates/times/courts.
 */
import { gameSetsOf } from "@/lib/tournaments/tie-breaks";

export type FixtureState = "upcoming" | "live" | "paused" | "completed" | "bye";
export type FixtureTiming = "saved" | "play_by" | "unscheduled";
export interface ClubFixture {
  id: string; source: "tournament" | "league"; competitionId: string; competition: string;
  category: string; round: number | null; a: string; b: string;
  date: string | null; time: string | null; court: string | null; playBy: string | null;
  timing: FixtureTiming; state: FixtureState; score: string | null; liveGames: string | null; mine: boolean;
  gameScores?: Array<{ a: number; b: number }>; currentGame?: { number: number; a: number; b: number } | null;
  winner?: string | null;
}
export interface FixtureFilters { competition?: string; category?: string; court?: string; date?: string; mine?: boolean }

/** Current game score line from saved game_scores (e.g. [[11,7],[5,3]] → "11-7, 5-3"). */
export function gameScoreLine(gs: unknown): string | null {
  const parsed = parseFixtureGames(gs);
  const parts = parsed.sets.map((g) => `${g.a}-${g.b}`);
  return parts.length ? parts.join(", ") : null;
}

function parseFixtureGames(raw: unknown): { sets: Array<{ a: number; b: number }>; current: { a: number; b: number } | null } {
  let value: any = raw;
  try { if (typeof value === "string") value = JSON.parse(value); } catch { value = null; }
  const valid = (g: any) => g && typeof g.a === "number" && typeof g.b === "number" && Number.isFinite(g.a) && Number.isFinite(g.b) && g.a >= 0 && g.b >= 0;
  const rows = Array.isArray(value) ? value.map((g) => Array.isArray(g) ? { a: g[0], b: g[1] } : g) : value?.sets;
  return { sets: Array.isArray(rows) ? rows.filter(valid) : [], current: valid(value?.current) ? value.current : null };
}

/** Read-only adapter for the marker's saved sets/current points and result score.
 * Uses the existing result reader, never treats the active rally as a won game.
 * Score orientation always follows the displayed A v B names (not winner-first).
 */
export function fixtureScoreDetails(m: { status?: string; score?: string | null; game_scores?: unknown; side_a_points?: number | null; side_b_points?: number | null }, pointsOnly = false) {
  const parsed = parseFixtureGames(m.game_scores);
  const saved = gameSetsOf({ game_scores: { sets: parsed.sets }, score: m.score });
  const sets = saved.sets ?? [];
  const hasPoints = typeof m.side_a_points === "number" && typeof m.side_b_points === "number";
  const current = m.status === "in_progress" ? (hasPoints ? { a: m.side_a_points as number, b: m.side_b_points as number } : parsed.current) : null;
  const score = pointsOnly
    ? (m.status === "completed" ? m.score ?? (sets.length ? `${sets[0].a}–${sets[0].b}` : null) : null)
    : sets.length ? `${sets.filter((g) => g.a > g.b).length}–${sets.filter((g) => g.b > g.a).length}` : null;
  return { score, gameScores: saved.pointsKnown ? sets : [], currentGame: current ? { number: parsed.sets.length + 1, ...current } : null };
}

export function fixtureState(m: { status?: string | null; is_bye?: boolean | null }, live: boolean, paused: boolean): FixtureState {
  if (m.is_bye) return "bye";
  if (m.status === "completed") return "completed";
  if (live) return "live";
  if (paused) return "paused";
  return "upcoming";
}

export function timingOf(m: { scheduled_date?: string | null; play_by?: string | null }): FixtureTiming {
  return m.scheduled_date ? "saved" : m.play_by ? "play_by" : "unscheduled";
}

export function filterFixtures(list: ClubFixture[], f: FixtureFilters): ClubFixture[] {
  return list.filter((x) =>
    (!f.competition || x.competitionId === f.competition) &&
    (!f.category || x.category === f.category) &&
    (!f.court || x.court === f.court) &&
    (!f.date || (x.date ?? x.playBy) === f.date) &&
    (!f.mine || x.mine));
}

/** Calendar days: saved fixtures by date, play-by deadlines on their deadline day, the rest under "Not scheduled". */
export function groupByDay(list: ClubFixture[]): Array<{ day: string; items: ClubFixture[] }> {
  const m = new Map<string, ClubFixture[]>();
  for (const x of list) {
    const k = x.timing === "saved" ? x.date! : x.timing === "play_by" ? x.playBy! : "Not scheduled";
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(x);
  }
  return [...m].sort(([a], [b]) => (a === "Not scheduled" ? 1 : b === "Not scheduled" ? -1 : a.localeCompare(b)))
    .map(([day, items]) => ({ day, items: items.sort((p, q) => (p.time ?? "99").localeCompare(q.time ?? "99") || (p.court ?? "").localeCompare(q.court ?? "")) }));
}

export function fmtFixtureDay(d: string): string {
  const [y, mo, da] = d.split("-").map(Number);
  if (!y || !mo || !da) return d;
  const dt = new Date(Date.UTC(y, mo - 1, da));
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()]} ${da} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mo - 1]} ${y}`;
}
