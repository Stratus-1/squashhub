/**
 * Handicap by average playing position in the player's regional league
 * (e.g. NSA), from scraped league rubbers in `nsa_rubber_history`.
 *
 * All leagues of a category form one ladder: every position in the 6th
 * League is stronger than any position in the 7th. A league contributes as
 * many steps as it has singles rubbers (max `position` seen in that league).
 *
 *   index(p)   = sum(rubbers of every stronger league) + avgPosition(p)
 *   handicap   = round(|index(A) − index(B)| × multiplier)   (nearest)
 *
 * A player's league is the one they played most rubbers in this season;
 * their average position is taken only from that league.
 */
import { fromExt } from "@/lib/supabase-ext";

export interface RubberRow {
  player_code: string | null;
  league_label: string | null;
  category?: string | null;
  position: number | null;
}

export interface LeagueStanding {
  category: string;
  division: number;
  avgPosition: number;
  rubbers: number;
  index: number;
}

export function leagueOrdinal(label: string | null | undefined): number | null {
  const m = String(label || "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** rubbers per league, keyed `${category}|${division}` */
export function leagueSizes(rows: RubberRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const d = leagueOrdinal(r.league_label);
    const p = Number(r.position);
    if (!d || !Number.isFinite(p) || p <= 0) continue;
    const k = `${(r.category || "").toLowerCase()}|${d}`;
    out.set(k, Math.max(out.get(k) || 0, p));
  }
  return out;
}

function offsetFor(category: string, division: number, sizes: Map<string, number>, fallback = 4): number {
  let off = 0;
  for (let d = 1; d < division; d++) off += sizes.get(`${category}|${d}`) || fallback;
  return off;
}

export function computeLeagueStandings(
  playerRows: RubberRow[],
  sizes: Map<string, number>,
): Map<string, LeagueStanding> {
  const tally = new Map<string, Map<string, { sum: number; n: number; category: string; division: number }>>();
  for (const r of playerRows) {
    const code = String(r.player_code || "").trim();
    const d = leagueOrdinal(r.league_label);
    const p = Number(r.position);
    if (!code || !d || !Number.isFinite(p) || p <= 0) continue;
    const category = (r.category || "").toLowerCase();
    const key = `${category}|${d}`;
    if (!tally.has(code)) tally.set(code, new Map());
    const m = tally.get(code)!;
    const cur = m.get(key) || { sum: 0, n: 0, category, division: d };
    cur.sum += p;
    cur.n += 1;
    m.set(key, cur);
  }
  const out = new Map<string, LeagueStanding>();
  tally.forEach((leagues, code) => {
    let best: { sum: number; n: number; category: string; division: number } | null = null;
    leagues.forEach((v) => {
      if (!best || v.n > best.n || (v.n === best.n && v.division < best.division)) best = v;
    });
    if (!best) return;
    const b = best as { sum: number; n: number; category: string; division: number };
    const avg = b.sum / b.n;
    out.set(code, {
      category: b.category,
      division: b.division,
      avgPosition: avg,
      rubbers: b.n,
      index: offsetFor(b.category, b.division, sizes) + avg,
    });
  });
  return out;
}

/** Stronger player (smaller index) starts on −handicap; weaker on 0. */
export function leagueAverageHandicap(
  a: number | null | undefined,
  b: number | null | undefined,
  multiplier = 1,
): { handicap_a: number; handicap_b: number } {
  if (a == null || b == null) return { handicap_a: 0, handicap_b: 0 };
  const diff = Math.round(Math.abs(a - b) * Math.max(0, Number(multiplier) || 1));
  if (diff === 0) return { handicap_a: 0, handicap_b: 0 };
  return a < b ? { handicap_a: -diff, handicap_b: 0 } : { handicap_a: 0, handicap_b: -diff };
}

/** member id → ladder index, from their active league number(s). */
export async function loadLeagueAverageScores(
  memberIds: string[],
  seasonYear = new Date().getFullYear(),
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (memberIds.length === 0) return out;
  const { data: affs } = await fromExt("member_association_affiliations")
    .select("club_member_id, league_association_number, active")
    .in("club_member_id", memberIds);
  const codesByMember = new Map<string, string[]>();
  for (const a of (affs || []) as any[]) {
    if (a.active === false || !a.league_association_number) continue;
    const list = codesByMember.get(a.club_member_id) || [];
    list.push(String(a.league_association_number).trim());
    codesByMember.set(a.club_member_id, list);
  }
  const codes = Array.from(new Set(Array.from(codesByMember.values()).flat()));
  if (codes.length === 0) return out;

  const { data: mine } = await fromExt("nsa_rubber_history")
    .select("player_code, league_label, category, position")
    .eq("season_year", seasonYear)
    .in("player_code", codes);
  const rows = (mine || []) as RubberRow[];
  if (rows.length === 0) return out;

  // League sizes from the whole season (all players), per category.
  const cats = Array.from(new Set(rows.map((r) => r.category).filter(Boolean))) as string[];
  const { data: all } = await fromExt("nsa_rubber_history")
    .select("league_label, category, position")
    .eq("season_year", seasonYear)
    .in("category", cats)
    .gte("position", 3)
    .limit(20000);
  const sizes = leagueSizes([...(all || []) as RubberRow[], ...rows]);
  const standings = computeLeagueStandings(rows, sizes);

  codesByMember.forEach((list, memberId) => {
    let best: number | null = null;
    for (const c of list) {
      const s = standings.get(c);
      if (s && (best == null || s.index < best)) best = s.index;
    }
    if (best != null) out.set(memberId, best);
  });
  return out;
}
