/**
 * Match Day Access — one shared concept for tournaments and league seasons.
 *
 * A competition has ONE persistent secret token. The overall page is
 * `/md/<token>`; a court page is `/md/<token>/court/<courtId>` (no extra token
 * per court); a match deep-link adds `?match=<id>`. All reads/writes go through
 * the token-checked `md_*` database functions — never the admin tables.
 */

export type MatchDayKind = "tournament" | "league_season";

export interface MatchDayMatch {
  id: string;
  date: string | null;
  time: string | null;
  court_id: number | null;
  status: string | null;
  side_a: string | null;
  side_b: string | null;
  score?: string | null;
  scorable?: boolean;
  [k: string]: any;
}

const PRODUCTION_ROOT = "squashhub.co.za";

export function matchDayPath(token: string, opts: { court?: number | null; matchId?: string | null } = {}): string {
  let p = `/md/${token}`;
  if (opts.court != null) p += `/court/${opts.court}`;
  if (opts.matchId) p += `?match=${encodeURIComponent(opts.matchId)}`;
  return p;
}

/** Absolute link; prefers the club subdomain on production, else current origin. */
export function matchDayUrl(
  token: string,
  opts: { court?: number | null; matchId?: string | null; subdomain?: string | null; origin?: string } = {},
): string {
  const path = matchDayPath(token, opts);
  let origin = opts.origin;
  if (!origin && typeof window !== "undefined") {
    const { hostname } = window.location;
    const onProd = hostname === PRODUCTION_ROOT || hostname.endsWith(`.${PRODUCTION_ROOT}`);
    origin = onProd && opts.subdomain ? `https://${opts.subdomain}.${PRODUCTION_ROOT}` : window.location.origin;
  }
  return `${origin ?? `https://${PRODUCTION_ROOT}`}${path}`;
}

const isDone = (m: MatchDayMatch) => ["completed", "submitted"].includes(String(m.status || ""));

function sortKey(m: MatchDayMatch) {
  return `${m.date ?? "9999-12-31"} ${m.time ?? "99:99"}`;
}

/** Courts a competition actually uses (for the printable sheet). */
export function courtsUsed(matches: MatchDayMatch[]): number[] {
  return [...new Set(matches.map((m) => m.court_id).filter((c): c is number => c != null))].sort((a, b) => a - b);
}

/**
 * Current + next match for one court on a given day. "Current" is the earliest
 * unfinished match today; "next" is the following unfinished one (today or later).
 */
export function courtNowNext(matches: MatchDayMatch[], court: number, today: string) {
  const onCourt = matches
    .filter((m) => m.court_id === court && !isDone(m) && (m.date == null || m.date >= today))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const current = onCourt.find((m) => m.date === today) ?? null;
  const next = onCourt.find((m) => m !== current) ?? null;
  return { current, next };
}

/** Fixtures list: today first, then upcoming, unfinished only. */
export function upcoming(matches: MatchDayMatch[], today: string) {
  return matches
    .filter((m) => !isDone(m) && (m.date == null || m.date >= today))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

export function results(matches: MatchDayMatch[]) {
  return matches.filter(isDone).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}

export interface StandingRow { name: string; group: string; played: number; won: number; lost: number; points: number }

/** Simple per-group table from completed tournament matches (display only). */
export function tournamentStandings(matches: MatchDayMatch[]): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  const get = (name: string, group: string) => {
    const k = `${group}|${name}`;
    if (!rows.has(k)) rows.set(k, { name, group, played: 0, won: 0, lost: 0, points: 0 });
    return rows.get(k)!;
  };
  for (const m of matches) {
    if (m.status !== "completed" || !m.side_a || !m.side_b || !m.winner) continue;
    const g = m.stage && !/pool|group/i.test(String(m.stage)) ? null : `Group ${m.group ?? 1}`;
    if (!g) continue;
    const a = get(m.side_a, g), b = get(m.side_b, g);
    a.played++; b.played++;
    if (m.winner === "a") { a.won++; a.points += 2; b.lost++; } else { b.won++; b.points += 2; a.lost++; }
  }
  return [...rows.values()].sort((x, y) => x.group.localeCompare(y.group) || y.points - x.points || y.won - x.won);
}

/** League table from fixture totals (display only). */
export function leagueStandings(matches: MatchDayMatch[]): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const m of matches) {
    const t = m.totals;
    if (!t || !["submitted", "completed"].includes(String(m.status))) continue;
    const group = m.division || "League";
    for (const [name, pts, won] of [
      [m.side_a, t.home_points, t.winner === "home"],
      [m.side_b, t.away_points, t.winner === "away"],
    ] as const) {
      if (!name) continue;
      const k = `${group}|${name}`;
      const r = rows.get(k) ?? { name, group, played: 0, won: 0, lost: 0, points: 0 };
      r.played++; r.points += Number(pts) || 0;
      if (won) r.won++; else r.lost++;
      rows.set(k, r);
    }
  }
  return [...rows.values()].sort((x, y) => x.group.localeCompare(y.group) || y.points - x.points);
}
