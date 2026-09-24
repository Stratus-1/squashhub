import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { TOURNAMENT_BETA_FEATURE } from "@/lib/smart-builder/access";

/** Does this club have Tournament Beta switched on? Fails CLOSED (beta is opt-in). */
export function useClubHasTournamentBeta(clubId: string | undefined) {
  return useQuery({
    queryKey: ["club-beta", TOURNAMENT_BETA_FEATURE, clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_beta_features")
        .select("club_id").eq("club_id", clubId!).eq("feature", TOURNAMENT_BETA_FEATURE).maybeSingle();
      if (error) return false;
      return !!data;
    },
    enabled: !!clubId,
    staleTime: 60_000,
  });
}

/** Super Admin: list of clubs with Tournament Beta. */
export function useTournamentBetaClubs() {
  return useQuery({
    queryKey: ["club-beta", TOURNAMENT_BETA_FEATURE, "all"],
    queryFn: async () => {
      const { data, error } = await fromExt("club_beta_features")
        .select("club_id, created_at, clubs(name)").eq("feature", TOURNAMENT_BETA_FEATURE);
      if (error) throw error;
      return (data ?? []) as { club_id: string; created_at: string; clubs: { name: string } | null }[];
    },
  });
}

export function useSetTournamentBeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clubId, on }: { clubId: string; on: boolean }) => {
      const q = on
        ? fromExt("club_beta_features").insert({ club_id: clubId, feature: TOURNAMENT_BETA_FEATURE })
        : fromExt("club_beta_features").delete().eq("club_id", clubId).eq("feature", TOURNAMENT_BETA_FEATURE);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["club-beta"] }),
  });
}
