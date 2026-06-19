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
  // Check club setting
  const { data: club } = await supabase
    .from("clubs")
    .select("ranking_points_enabled, points_base_win, points_upset_bonus_per_rank, points_favourite_win_min, points_loser_deduction")
    .eq("id", p.clubId)
    .maybeSingle();
  if (!club || !(club as any).ranking_points_enabled) return null;

  const settings: RankingFormulaSettings = p.settings ?? {
    base_win: Number((club as any).points_base_win ?? DEFAULT_FORMULA.base_win),
    upset_bonus_per_rank: Number((club as any).points_upset_bonus_per_rank ?? DEFAULT_FORMULA.upset_bonus_per_rank),
    favourite_win_min: Number((club as any).points_favourite_win_min ?? DEFAULT_FORMULA.favourite_win_min),
    loser_deduction: Number((club as any).points_loser_deduction ?? DEFAULT_FORMULA.loser_deduction),
  };

  // Get current point ranks for both players (1-based, by ranking_points desc)
  const { data: members } = await supabase
    .from("club_members")
    .select("id, ranking_points")
    .eq("club_id", p.clubId)
    .order("ranking_points", { ascending: false });
  const ranks = new Map<string, number>();
  (members || []).forEach((m: any, i: number) => ranks.set(m.id, i + 1));
  const winnerRank = ranks.get(p.winnerMemberId) ?? null;
  const loserRank = ranks.get(p.loserMemberId) ?? null;

  const { winnerDelta, loserDelta } = computeRankingDeltas(winnerRank, loserRank, settings);

  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("ranking_points_pending" as any)
    .insert({
      club_id: p.clubId,
      match_source_type: p.matchSourceType,
      match_source_id: p.matchSourceId ?? null,
      winner_member_id: p.winnerMemberId,
      loser_member_id: p.loserMemberId,
      winner_rank_at_match: winnerRank,
      loser_rank_at_match: loserRank,
      winner_delta: winnerDelta,
      loser_delta: loserDelta,
      submitted_by: userData.user?.id ?? null,
    })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}
