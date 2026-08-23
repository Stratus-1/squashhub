import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type LeagueSeason,
  resolveCurrentSeason,
  sortSeasons,
} from "@/lib/leagues/seasons";

interface Options {
  /** Tenant association id (club-owned league). */
  associationId?: string | null;
  /** Platform association id (shared association that owns fixtures). */
  platformAssociationId?: string | null;
  /** Explicitly selected season, if a screen offers a picker. */
  selectedSeasonId?: string | null;
}

/**
 * Read-only season context for league screens (Phase 1).
 * Returns the seasons of a league plus the one a screen should default to.
 */
export function useLeagueSeasons({
  associationId,
  platformAssociationId,
  selectedSeasonId,
}: Options) {
  const enabled = Boolean(associationId || platformAssociationId);

  const query = useQuery({
    queryKey: ["league-seasons", associationId ?? null, platformAssociationId ?? null],
    enabled,
    queryFn: async (): Promise<LeagueSeason[]> => {
      let request = supabase
        .from("league_seasons")
        .select(
          "id, association_id, platform_association_id, club_id, season_year, label, status, is_current, starts_on, ends_on",
        );

      request = associationId
        ? request.eq("association_id", associationId)
        : request.eq("platform_association_id", platformAssociationId!);

      const { data, error } = await request.order("season_year", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeagueSeason[];
    },
  });

  const seasons = sortSeasons(query.data ?? []);
  const currentSeason = resolveCurrentSeason(seasons, selectedSeasonId);

  return {
    seasons,
    currentSeason,
    currentSeasonId: currentSeason?.id ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
