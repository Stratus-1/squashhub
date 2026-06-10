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
 */

export type LeagueInfo = {
  league_number: number;
  size: number; // total slots (registered + reserves)
};

export type PlayerRank = {
  member_id: string;
  league_number: number;
  ladder_position: number;
} | null;

/**
 * Build a lookup of cumulative offsets, where offsets[N] = sum of sizes
 * for every league with league_number < N. Players in league N then have
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

export type HandicapResult = { handicap_a: number; handicap_b: number };

/**
 * Compute starting-score offsets for two players. The stronger player
 * (lower global index) gets a negative starting score; the weaker gets 0.
 * If either player can't be ranked (no league registration), both return 0.
 */
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
  if (ia < ib) {
    // A is stronger
    return { handicap_a: -diff, handicap_b: 0 };
  }
  return { handicap_a: 0, handicap_b: -diff };
}
