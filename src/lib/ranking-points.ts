import { supabase } from "@/integrations/supabase/client";

export type MatchSourceType = "tournament" | "league" | "challenge" | "manual" | "match";

export interface RankingFormulaSettings {
  base_win: number;
  upset_bonus_per_rank: number;
  favourite_win_min: number;
  loser_deduction: number;
}

export const DEFAULT_FORMULA: RankingFormulaSettings = {
  base_win: 0.25,
  upset_bonus_per_rank: 0.1,
  favourite_win_min: 0.1,
  loser_deduction: 0,
};

/**
 * Compute proposed point deltas for a result.
 *  - `winnerRank` / `loserRank` are positions on the RANKING POINTS leaderboard
 *    at the time of the match (1 = top). Pass `null` if unknown — falls back to base only.
 */
export function computeRankingDeltas(
  winnerRank: number | null,
  loserRank: number | null,
  s: RankingFormulaSettings = DEFAULT_FORMULA,
): { winnerDelta: number; loserDelta: number } {
  const wr = winnerRank ?? null;
  const lr = loserRank ?? null;
  if (wr == null || lr == null) {
    return { winnerDelta: round2(s.base_win), loserDelta: round2(-s.loser_deduction) };
  }
  const gap = lr - wr; // positive if winner was higher-ranked (lower number) ... wait
  // Lower position number = higher rank. So if winner is #6 and loser is #12:
  // wr=6, lr=12 → gap = lr - wr = 6 (favourite won, gap>0 means winner was favoured)
  // Underdog win: winner is #12, loser is #6 → wr=12, lr=6 → gap = -6
  if (gap < 0) {
    // Underdog win — bigger bonus
    const winnerDelta = s.base_win + s.upset_bonus_per_rank * Math.abs(gap);
    const loserDelta = -s.loser_deduction;
    return { winnerDelta: round2(winnerDelta), loserDelta: round2(loserDelta) };
  }
  // Favourite win — small or floor amount
  const winnerDelta = Math.max(s.base_win - 0.02 * gap, s.favourite_win_min);
  return { winnerDelta: round2(winnerDelta), loserDelta: 0 };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export interface EnqueueParams {
  clubId: string;
  matchSourceType: MatchSourceType;
  matchSourceId?: string | null;
  winnerMemberId: string;
  loserMemberId: string;
  settings?: RankingFormulaSettings;
}

/**
 * Look up current ranking-point ranks for both members and enqueue a pending
 * delta. Safe no-op (returns null) if the club has ranking points disabled.
 */
export async function enqueueRankingDelta(p: EnqueueParams) {
  // Server-side engine: applies the club's current rules (formula or ladder-mirror),
  // enforces the per-competition switches and never counts a result twice.
  const { data, error } = await supabase.rpc("award_ranking_points_for_result" as any, {
    _club_id: p.clubId,
    _winner_member_id: p.winnerMemberId,
    _loser_member_id: p.loserMemberId,
    _source_type: p.matchSourceType,
    _source_id: p.matchSourceId ?? null,
  });
  if (error) throw error;
  return data ?? null;
}
