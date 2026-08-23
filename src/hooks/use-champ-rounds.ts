/**
 * Configured knockout rounds for a championship (`club_champs_rounds`).
 *
 * The plan is what the organiser declared up front — R1 → SF → F — so the UI
 * never has to guess what the next stage is called or whether it should exist.
 */
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import type { ChampRound } from "@/lib/tournaments/knockout-progression";

export function useChampRounds(champId?: string | null) {
  return useQuery<ChampRound[]>({
    queryKey: ["club-champ-rounds", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_rounds")
        .select("*")
        .eq("champ_id", champId!)
        .order("group_number")
        .order("section_number")
        .order("round_number");
      if (error) throw error;
      return (data || []) as ChampRound[];
    },
    enabled: !!champId,
    staleTime: 30_000,
  });
}
