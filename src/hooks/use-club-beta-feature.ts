import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";

/** Riverside-first tournament view pilot switches (one row per club + feature in club_beta_features). */
export const TOURNAMENT_VIEW_FEATURES = {
  tournament_viewer_shell: "Interactive viewer (expand / zoom / pan)",
  tournament_pool_matrix_view: "Pool matrix + order of play",
  tournament_swiss_progression_view: "Swiss progression standings",
  tournament_bracket_view: "Knockout / Monrad bracket",
  tournament_schedule_board: "Court schedule board",
  tournament_swiss_category_rounds: "Swiss rounds per category (setup)",
  tournament_swiss_positional_draw: "Fixed-position Swiss draw (pilot)",
  tournament_stage_planner: "Stage planner in Planned format (pilot)",
  tournament_structure_step: "One Tournament structure step (pilot)",
  tournament_card_structure: "New one-page structure builder",
  tournament_first_to_target: "First-to-target scoring (Riverside pilot)",
  tournament_swiss_partial_rounds: "Partial Swiss round generation (settled positions, pilot)",
} as const;
export type TournamentViewFeature = keyof typeof TOURNAMENT_VIEW_FEATURES;

/** Pure lookup: any error or missing row means OFF (fails closed). */
export async function fetchClubBetaFeature(
  clubId: string,
  feature: string,
  from: typeof fromExt = fromExt,
): Promise<boolean> {
  try {
    const { data, error } = await from("club_beta_features")
      .select("club_id").eq("club_id", clubId).eq("feature", feature).maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

export function useClubBetaFeature(clubId: string | undefined, feature: string) {
  return useQuery({
    queryKey: ["club-beta", feature, clubId],
    queryFn: () => fetchClubBetaFeature(clubId!, feature),
    enabled: !!clubId,
    staleTime: 60_000,
  });
}

/** Super Admin: every club row for the tournament view switches. */
export function useTournamentViewFeatureRows() {
  return useQuery({
    queryKey: ["club-beta", "tournament-views", "all"],
    queryFn: async () => {
      const { data, error } = await fromExt("club_beta_features")
        .select("club_id, feature, clubs(name)")
        .in("feature", Object.keys(TOURNAMENT_VIEW_FEATURES));
      if (error) throw error;
      return (data ?? []) as { club_id: string; feature: TournamentViewFeature; clubs: { name: string } | null }[];
    },
  });
}

export function useSetClubBetaFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clubId, feature, on }: { clubId: string; feature: TournamentViewFeature; on: boolean }) => {
      const q = on
        ? fromExt("club_beta_features").insert({ club_id: clubId, feature })
        : fromExt("club_beta_features").delete().eq("club_id", clubId).eq("feature", feature);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["club-beta"] }),
  });
}
