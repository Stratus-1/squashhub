import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PROVISIONAL,
  ProvisionalSettings,
  RankingScope,
} from "@/lib/rankings/provisional";

/**
 * Provisional settings for ONE ranking system. Club, regional and national
 * settings are stored separately and never fall back onto each other.
 */
export function useProvisionalSettings(
  scope: RankingScope,
  ownerId: string | null | undefined,
) {
  return useQuery<ProvisionalSettings>({
    queryKey: ["provisional-settings", scope, ownerId],
    enabled: !!ownerId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (scope === "club") {
        const { data } = await (supabase as any)
          .from("clubs")
          .select("ranking_provisional_enabled, ranking_provisional_start_points, ranking_provisional_min_matches")
          .eq("id", ownerId!)
          .maybeSingle();
        return {
          enabled: data?.ranking_provisional_enabled !== false,
          startPoints: Number(data?.ranking_provisional_start_points ?? DEFAULT_PROVISIONAL.startPoints),
          minMatches: Number(data?.ranking_provisional_min_matches ?? DEFAULT_PROVISIONAL.minMatches),
        };
      }
      const table = scope === "association" ? "association_ranking_settings" : "organisation_settings";
      const idCol = scope === "association" ? "association_id" : "org_id";
      const { data } = await (supabase as any)
        .from(table)
        .select("provisional_enabled, provisional_start_points, provisional_min_matches")
        .eq(idCol, ownerId!)
        .maybeSingle();
      return {
        enabled: data?.provisional_enabled !== false,
        startPoints: Number(data?.provisional_start_points ?? DEFAULT_PROVISIONAL.startPoints),
        minMatches: Number(data?.provisional_min_matches ?? DEFAULT_PROVISIONAL.minMatches),
      };
    },
  });
}

/** Ranked-match counts per member for a club's ranking system. */
export function useClubRankedMatchCounts(clubId: string | null | undefined) {
  return useQuery<Map<string, number>>({
    queryKey: ["club-ranked-match-counts", clubId],
    enabled: !!clubId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("club_ranked_match_counts", {
        _club_id: clubId!,
      });
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of (data ?? []) as { member_id: string; matches: number }[]) {
        map.set(row.member_id, Number(row.matches ?? 0));
      }
      return map;
    },
  });
}
