import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RankingMovementEntry {
  memberId: string;
  previousRank: number;
  previousPoints: number;
}

export interface RankingMovement {
  periodStart: string | null;
  byMember: Map<string, RankingMovementEntry>;
}

/**
 * Latest monthly ranking snapshot for a club — used to show how far each player
 * has moved on the points leaderboard since the last snapshot.
 */
export function useRankingMovement(clubId?: string | null, enabled = true) {
  return useQuery<RankingMovement>({
    queryKey: ["club-ranking-movement", clubId],
    enabled: !!clubId && enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const empty: RankingMovement = { periodStart: null, byMember: new Map() };
      const { data: snap } = await (supabase as any)
        .from("club_ranking_snapshots")
        .select("id, period_start")
        .eq("club_id", clubId!)
        .order("period_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!snap?.id) return empty;

      const { data: entries } = await (supabase as any)
        .from("club_ranking_snapshot_entries")
        .select("club_member_id, rank, ranking_points")
        .eq("snapshot_id", snap.id);

      const byMember = new Map<string, RankingMovementEntry>();
      (entries ?? []).forEach((e: any) => {
        byMember.set(e.club_member_id, {
          memberId: e.club_member_id,
          previousRank: Number(e.rank),
          previousPoints: Number(e.ranking_points ?? 0),
        });
      });
      return { periodStart: snap.period_start as string, byMember };
    },
  });
}

/** Positive = moved up the board (rank number decreased). */
export function rankDelta(currentRank: number, previousRank?: number | null) {
  if (previousRank == null) return null;
  return previousRank - currentRank;
}
