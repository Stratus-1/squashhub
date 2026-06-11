/**
 * League-ranking handicap helper.
 *
 * Each player has exactly one league + ladder position. Leagues are
 * concatenated in order (league_number ascending) to form a single
 * "global ladder index":
 *
 *   globalIndex(player) = sum(size of every league above) + ladder_position
 *
 * For a singles match A vs B, the stronger player (smaller globalIndex)
 * starts on a negative score equal to the position gap; the weaker
 * player starts on 0. No cap.
 *
 * In time-capped (Bells-style) play this offset is simply added to
 * side_a_points / side_b_points at match start, so total points
 * scored — which drives standings — already includes the handicap.
 */

import { fromExt } from "@/lib/supabase-ext";

export type LeagueInfo = {
  league_number: number;
  size: number; // total slots (registered + reserves)
};

export type PlayerRank = {
  member_id: string;
  league_number: number;
  ladder_position: number;
} | null;

export type HandicapResult = { handicap_a: number; handicap_b: number };

/**
 * Build a lookup of cumulative offsets, where offsets[N] = sum of sizes
 * of every league with league_number < N. Players in league N then have
 * globalIndex = offsets[N] + ladder_position.
 */
export function buildLeagueOffsets(leagues: LeagueInfo[]): Record<number, number> {
  const sorted = [...leagues].sort((a, b) => a.league_number - b.league_number);
  const out: Record<number, number> = {};
  let cum = 0;
  for (const l of sorted) {
    out[l.league_number] = cum;
    cum += Math.max(0, l.size || 0);
  }
  return out;
}

function globalIndex(p: PlayerRank, offsets: Record<number, number>): number | null {
  if (!p) return null;
  const off = offsets[p.league_number];
  if (off == null) return null;
  return off + (p.ladder_position || 0);
}

/**
 * Maximum handicap (in points) the stronger player can start on. Raw
 * ladder-index gaps can be huge across many leagues (e.g. league 1 #1 vs
 * league 5 #4 = ~94), which is nonsensical for a Bells-style match that
 * typically lasts 8 minutes. Cap to a sensible competitive offset.
 */
export const MAX_HANDICAP = 10;

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
  const diff = Math.min(Math.abs(ia - ib), MAX_HANDICAP);
  if (ia < ib) return { handicap_a: -diff, handicap_b: 0 };
  return { handicap_a: 0, handicap_b: -diff };
}

/**
 * Derive a numeric league_number from a leagues.name like
 * "1st League", "4th League Men", "Mixed League 2". Falls back to a
 * stable order based on creation time when no digit is present.
 */
function deriveLeagueNumber(name: string | null | undefined, fallback: number): number {
  if (!name) return fallback;
  const m = name.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return fallback;
}

/**
 * Pulls every league for the given club, counts registrations per league
 * (registered + reserve), and returns a ready-to-use offsets map keyed
 * by league_number, plus a per-member ranking lookup.
 *
 * Returns null if the club has no leagues we can use.
 */
export async function loadClubLadderContext(clubId: string): Promise<{
  offsets: Record<number, number>;
  rankByMember: Map<string, { league_number: number; ladder_position: number }>;
} | null> {
  const { data: leagues } = await fromExt("leagues")
    .select("id, name, created_at")
    .eq("club_id", clubId);
  if (!leagues || leagues.length === 0) return null;

  // Stable fallback ordering: by created_at.
  const sortedByCreated = [...leagues].sort((a: any, b: any) =>
    String(a.created_at || "").localeCompare(String(b.created_at || "")),
  );
  const leagueNumberById = new Map<string, number>();
  sortedByCreated.forEach((l: any, idx: number) => {
    leagueNumberById.set(l.id, deriveLeagueNumber(l.name, idx + 1));
  });

  const leagueIds = leagues.map((l: any) => l.id);
  const { data: regs } = await fromExt("member_league_registrations")
    .select("club_member_id, league_id, player_rank, is_reserve, reserve_order")
    .in("league_id", leagueIds);

  const sizeByLeagueNumber: Record<number, number> = {};
  const rankByMember = new Map<string, { league_number: number; ladder_position: number }>();

  for (const r of regs || []) {
    const ln = leagueNumberById.get((r as any).league_id);
    if (ln == null) continue;
    sizeByLeagueNumber[ln] = (sizeByLeagueNumber[ln] || 0) + 1;
  }

  // Recompute ladder_position per league based on player_rank (non-reserve)
  // then reserves appended in reserve_order. Falls back to insertion order.
  const byLeague = new Map<string, any[]>();
  for (const r of regs || []) {
    const arr = byLeague.get((r as any).league_id) || [];
    arr.push(r);
    byLeague.set((r as any).league_id, arr);
  }
  for (const [leagueId, arr] of byLeague.entries()) {
    const ln = leagueNumberById.get(leagueId)!;
    const mains = arr
      .filter((r) => !r.is_reserve)
      .sort((a, b) => (a.player_rank ?? 9999) - (b.player_rank ?? 9999));
    const reserves = arr
      .filter((r) => r.is_reserve)
      .sort((a, b) => (a.reserve_order ?? 9999) - (b.reserve_order ?? 9999));
    [...mains, ...reserves].forEach((r, idx) => {
      rankByMember.set(r.club_member_id, {
        league_number: ln,
        ladder_position: idx + 1,
      });
    });
  }

  const leagueInfos: LeagueInfo[] = Object.entries(sizeByLeagueNumber).map(
    ([n, s]) => ({ league_number: Number(n), size: s }),
  );
  return { offsets: buildLeagueOffsets(leagueInfos), rankByMember };
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
