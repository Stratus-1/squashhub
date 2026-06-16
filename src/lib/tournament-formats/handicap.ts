/**
 * League-rank handicap helper.
 *
 * Each club organises its league as a list of TEAM rows in `leagues`,
 * grouped into divisions ("1st League", "2nd League", …). Divisions
 * aren't stored as a column — they're inferred from the ordered team
 * `code` sequence with the "…Reserves" rows acting as dividers (same
 * rule used by `src/pages/Ladder.tsx`).
 *
 * Within a single division every team has the same number of player
 * positions (e.g. 5). A player's handicap rank is simply their
 * `player_rank` (1..N) inside their team — team identity within a
 * division does NOT matter. Two #1s in the same division have a
 * handicap of 0; #1 vs #4 in the same division = 3.
 *
 * Across divisions we accumulate the size of each lower division so a
 * player from a weaker division starts behind every player from a
 * stronger one. So:
 *   global(p) = sum(size(D) for D < p.division) + p.player_rank
 *   handicap  = |global(A) − global(B)|
 *
 * The stronger player (smaller global) starts on `−handicap`; the
 * weaker player starts on 0.
 */

import { fromExt } from "@/lib/supabase-ext";

export type PlayerRank = {
  member_id: string;
  /** 1-based division index (1 = strongest). */
  division: number;
  /** 1..N position inside their team. */
  player_rank: number;
} | null;

export type HandicapResult = { handicap_a: number; handicap_b: number };

/** Per-division size (max player_rank seen among mains). */
export type DivisionSizes = Record<number, number>;

/** Cumulative offset table: offsets[D] = sum(size of every division < D). */
export function buildDivisionOffsets(sizes: DivisionSizes): Record<number, number> {
  const divs = Object.keys(sizes)
    .map((k) => Number(k))
    .sort((a, b) => a - b);
  const out: Record<number, number> = {};
  let cum = 0;
  for (const d of divs) {
    out[d] = cum;
    cum += Math.max(0, sizes[d] || 0);
  }
  return out;
}

function globalIndex(p: PlayerRank, offsets: Record<number, number>): number | null {
  if (!p) return null;
  const off = offsets[p.division];
  if (off == null) return null;
  return off + (p.player_rank || 0);
}

/** Stronger player gets negative starting score; weaker starts on 0. */
export function computeHandicap(
  playerA: PlayerRank,
  playerB: PlayerRank,
  offsets: Record<number, number>,
): HandicapResult {
  const ia = globalIndex(playerA, offsets);
  const ib = globalIndex(playerB, offsets);
  if (ia == null || ib == null) return { handicap_a: 0, handicap_b: 0 };
  if (ia === ib) return { handicap_a: 0, handicap_b: 0 };
  const diff = Math.abs(ia - ib);
  if (ia < ib) return { handicap_a: -diff, handicap_b: 0 };
  return { handicap_a: 0, handicap_b: -diff };
}

/** Parse first integer out of a league code like "NIL021" → 21. */
function codeNum(c: string | null | undefined): number {
  if (!c) return Number.NaN;
  const m = c.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : Number.NaN;
}

const isReserveTeam = (name: string | null | undefined) =>
  !!name && /reserve/i.test(name);

/** Parse ordinal like "3rd" → 3 from a string. */
function parseOrdinal(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+)\s*(?:st|nd|rd|th)/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Build a tier-vote map (team_code → division ordinal 1..N) from the
 * platform league fixtures the admin "Manage Teams" view also reads.
 * Round names like "1st League round 1" reveal each team's true tier
 * irrespective of code ordering — this is the authoritative source.
 */
async function loadFixtureTiersByCode(
  associationIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (associationIds.length === 0) return out;
  // Resolve platform_association_id per association (fallback to self).
  const { data: assocRows } = await fromExt("league_associations")
    .select("id, platform_association_id")
    .in("id", associationIds);
  const platformByAssoc = new Map<string, string>();
  (assocRows || []).forEach((a: any) => {
    platformByAssoc.set(a.id, a.platform_association_id || a.id);
  });
  for (const aid of associationIds) {
    if (!platformByAssoc.has(aid)) platformByAssoc.set(aid, aid);
  }

  for (const aid of associationIds) {
    const platformId = platformByAssoc.get(aid)!;
    const { data: rounds } = await fromExt("league_rounds")
      .select("id, name")
      .eq("association_id", aid);
    const roundTier = new Map<string, number>();
    (rounds || []).forEach((r: any) => {
      const ord = parseOrdinal(String(r.name || "").replace(/\s+(round|week|wk|rd)\s*\d+\s*$/i, ""));
      if (ord) roundTier.set(r.id, ord);
    });
    const roundIds = Array.from(roundTier.keys());
    if (roundIds.length === 0) continue;
    const { data: fx } = await fromExt("platform_league_fixtures")
      .select("round_id, home_team_code, away_team_code")
      .eq("association_id", platformId)
      .in("round_id", roundIds);
    const tally = new Map<string, Map<number, number>>();
    const bump = (code: string | null, ord: number) => {
      if (!code || code.startsWith("__")) return;
      const key = code.toUpperCase();
      if (!tally.has(key)) tally.set(key, new Map());
      const m = tally.get(key)!;
      m.set(ord, (m.get(ord) || 0) + 1);
    };
    (fx || []).forEach((f: any) => {
      const ord = roundTier.get(f.round_id);
      if (!ord) return;
      bump(f.home_team_code, ord);
      bump(f.away_team_code, ord);
    });
    tally.forEach((m, code) => {
      let bestOrd = 0, best = -1;
      m.forEach((n, ord) => { if (n > best) { best = n; bestOrd = ord; } });
      if (bestOrd > 0) out.set(code, bestOrd);
    });
  }
  return out;
}

/**
 * Classify each league row into a division using the same priority the
 * admin Leagues UI uses:
 *   1. Tier derived from actual fixtures (per team code) — truth.
 *   2. Ordinal parsed from the league's own name.
 *   3. Ordinal parsed from the reserves-name (for reserves rows).
 *   4. Code-based reserves-anchor fallback.
 */
function classifyLeaguesByDivision(
  leagues: Array<{ id: string; name: string; code: string | null }>,
  fixtureTierByCode: Map<string, number>,
): Map<string, { division: number; is_reserve_team: boolean }> {
  const out = new Map<string, { division: number; is_reserve_team: boolean }>();
  const sorted = [...leagues]
    .filter((l) => Number.isFinite(codeNum(l.code)))
    .sort((a, b) => codeNum(a.code) - codeNum(b.code));

  // Build reserves anchor list (for fallback): sorted by code position.
  const reservesAnchors: Array<{ idx: number; ord: number | null }> = [];
  sorted.forEach((l, i) => {
    if (isReserveTeam(l.name)) {
      reservesAnchors.push({ idx: i, ord: parseOrdinal(l.name) });
    }
  });

  let codeFallbackDivision = 1;
  sorted.forEach((l, i) => {
    const isReserve = isReserveTeam(l.name);
    const code = String(l.code || "").toUpperCase();
    // 1. Fixture-based tier (only for non-reserve rows; reserves rarely
    //    appear in fixtures).
    let division: number | null = null;
    if (!isReserve) {
      const fx = fixtureTierByCode.get(code);
      if (fx) division = fx;
    }
    // 2. Ordinal in the league's own name (e.g. "Men's 2nd Eagles" or
    //    "3rd L Reserves" → 3).
    if (division == null) {
      const own = parseOrdinal(l.name);
      if (own) division = own;
    }
    // 3. Code-based fallback: next reserves anchor at/after this row.
    if (division == null) {
      const nextRes = reservesAnchors.find(a => a.idx >= i && a.ord != null);
      if (nextRes && nextRes.ord != null) division = nextRes.ord;
    }
    // 4. Hard fallback: monotonically increasing per reserves divider.
    if (division == null) division = codeFallbackDivision;
    if (isReserve) codeFallbackDivision = Math.max(codeFallbackDivision, division + 1);
    out.set(l.id, { division, is_reserve_team: isReserve });
  });

  // Leagues without parseable codes — fall back to bottom tier.
  const maxDiv = Array.from(out.values()).reduce((m, v) => Math.max(m, v.division), 1);
  for (const l of leagues) {
    if (!out.has(l.id)) {
      const own = parseOrdinal(l.name);
      out.set(l.id, {
        division: own ?? maxDiv,
        is_reserve_team: isReserveTeam(l.name),
      });
    }
  }
  return out;
}

/**
 * Pulls every league + registration for the club, infers divisions,
 * picks each member's strongest registration, and returns ready-to-use
 * offsets + per-member rank lookup.
 */
export async function loadClubLadderContext(clubId: string): Promise<{
  offsets: Record<number, number>;
  rankByMember: Map<string, { division: number; player_rank: number }>;
} | null> {
  const { data: leagues } = await fromExt("leagues")
    .select("id, name, code")
    .eq("club_id", clubId);
  if (!leagues || leagues.length === 0) return null;

  const classify = classifyLeaguesByDivision(
    leagues as Array<{ id: string; name: string; code: string | null }>,
  );

  const leagueIds = (leagues as any[]).map((l) => l.id);
  const { data: regs } = await fromExt("member_league_registrations")
    .select("club_member_id, league_id, player_rank, is_reserve, reserve_order")
    .in("league_id", leagueIds);

  // Size per division = max player_rank seen among MAIN team registrations
  // in any team belonging to that division. Falls back to 5 (common case).
  const sizes: DivisionSizes = {};
  for (const r of (regs || []) as any[]) {
    const meta = classify.get(r.league_id);
    if (!meta || meta.is_reserve_team) continue;
    if (r.is_reserve) continue;
    const d = meta.division;
    const pr = Number(r.player_rank) || 0;
    if (pr <= 0) continue;
    sizes[d] = Math.max(sizes[d] || 0, pr);
  }
  // Make sure every division that has ANY team has a size entry, so the
  // offset table grows monotonically even for empty divisions.
  for (const meta of classify.values()) {
    if (sizes[meta.division] == null) sizes[meta.division] = 5;
  }

  const offsets = buildDivisionOffsets(sizes);

  // Pick the strongest registration per member:
  //   1. non-reserve beats reserve
  //   2. lower division beats higher
  //   3. lower player_rank beats higher
  type Pick = { division: number; player_rank: number; rank_score: number };
  const best = new Map<string, Pick>();
  for (const r of (regs || []) as any[]) {
    const meta = classify.get(r.league_id);
    if (!meta) continue;
    // Skip reserve-team registrations entirely for handicap — they're
    // not part of the main ladder. (Reserve players still get picked up
    // via any main-team registration they hold.)
    if (meta.is_reserve_team) continue;
    if (r.is_reserve) continue;
    const pr = Number(r.player_rank) || 0;
    if (pr <= 0) continue;
    const score = meta.division * 1000 + pr; // smaller = stronger
    const prev = best.get(r.club_member_id);
    if (!prev || score < prev.rank_score) {
      best.set(r.club_member_id, {
        division: meta.division,
        player_rank: pr,
        rank_score: score,
      });
    }
  }

  const rankByMember = new Map<string, { division: number; player_rank: number }>();
  best.forEach((v, k) =>
    rankByMember.set(k, { division: v.division, player_rank: v.player_rank }),
  );

  return { offsets, rankByMember };
}

/**
 * Bulk-apply league-rank handicap to every non-completed singles match
 * in a tournament. Skips matches whose `handicap_locked` is true (admin
 * has manually pinned the offset). Returns the number of matches updated.
 */
export async function applyHandicapsToChamp(champId: string, clubId: string): Promise<number> {
  const ctx = await loadClubLadderContext(clubId);
  if (!ctx) return 0;
  const { offsets, rankByMember } = ctx;

  const { data: matches } = await fromExt("club_champs_matches")
    .select("id, player_a_member_id, player_b_member_id, status, handicap_a, handicap_b, handicap_locked, is_bye")
    .eq("champ_id", champId);
  if (!matches || matches.length === 0) return 0;

  let updated = 0;
  for (const m of matches as any[]) {
    if (m.handicap_locked) continue;
    if (m.is_bye) continue;
    if (m.status === "completed") continue;
    const pa = rankByMember.get(m.player_a_member_id) || null;
    const pb = rankByMember.get(m.player_b_member_id) || null;
    const rA: PlayerRank = pa ? { member_id: m.player_a_member_id, ...pa } : null;
    const rB: PlayerRank = pb ? { member_id: m.player_b_member_id, ...pb } : null;
    const hc = computeHandicap(rA, rB, offsets);
    if (hc.handicap_a === (m.handicap_a ?? 0) && hc.handicap_b === (m.handicap_b ?? 0)) continue;
    await fromExt("club_champs_matches")
      .update({ handicap_a: hc.handicap_a, handicap_b: hc.handicap_b })
      .eq("id", m.id);
    updated += 1;
  }
  return updated;
}
