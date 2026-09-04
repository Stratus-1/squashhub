import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sortSeasons, type LeagueSeason } from "@/lib/leagues/seasons";

/**
 * Seasons opened by a league association (the association is the owner of the
 * season calendar — clubs only respond by creating their teams for that year).
 */
export function useAssociationSeasons(platformAssociationId?: string | null) {
  const query = useQuery({
    queryKey: ["assoc-league-seasons", platformAssociationId ?? null],
    enabled: !!platformAssociationId,
    queryFn: async (): Promise<LeagueSeason[]> => {
      const { data, error } = await supabase
        .from("league_seasons")
        .select(
          "id, association_id, platform_association_id, club_id, season_year, label, status, is_current, starts_on, ends_on",
        )
        .eq("platform_association_id", platformAssociationId!)
        .order("season_year", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeagueSeason[];
    },
  });

  const seasons = sortSeasons(query.data ?? []);
  const latest = seasons.length
    ? seasons.reduce((a, b) => (b.season_year > a.season_year ? b : a))
    : null;

  return { seasons, latest, isLoading: query.isLoading, refetch: query.refetch };
}
