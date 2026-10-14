/**
 * Club-wide fixtures (Riverside pilot, read-only). Normalises the SAME saved
 * matches the Tournaments page already loads (and keeps live via realtime) —
 * no second scoring engine, no invented dates/times/courts.
 */
export type FixtureState = "upcoming" | "live" | "paused" | "completed" | "bye";
export type FixtureTiming = "saved" | "play_by" | "unscheduled";
export interface ClubFixture {
  id: string; source: "tournament" | "league"; competitionId: string; competition: string;
  category: string; round: number | null; a: string; b: string;
  date: string | null; time: string | null; court: string | null; playBy: string | null;
  timing: FixtureTiming; state: FixtureState; score: string | null; liveGames: string | null; mine: boolean;
}
export interface FixtureFilters { competition?: string; category?: string; court?: string; date?: string; mine?: boolean }

/** Current game score line from saved game_scores (e.g. [[11,7],[5,3]] → "11-7, 5-3"). */
export function gameScoreLine(gs: unknown): string | null {
  if (!Array.isArray(gs) || !gs.length) return null;
  const parts = gs.map((g: any) => Array.isArray(g) ? `${g[0]}-${g[1]}` : g && typeof g === "object" && "a" in g ? `${g.a}-${g.b}` : null).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
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
