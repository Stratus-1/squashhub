/**
 * League seasons — Phase 1 read-only foundation.
 *
 * A league's permanent identity lives in `league_associations` (tenant) or
 * `platform_league_associations` (platform). A *season* is a dated instance of
 * that league. Season rows are owned by exactly one of the two, which is what
 * keeps platform fixtures from fanning out across the tenant mirror rows.
 */

export type LeagueSeasonStatus = "planned" | "active" | "completed" | "archived";

export interface LeagueSeason {
  id: string;
  association_id: string | null;
  platform_association_id: string | null;
  club_id: string | null;
  season_year: number;
  label: string;
  status: LeagueSeasonStatus;
  is_current: boolean;
  starts_on: string | null;
  ends_on: string | null;
}

/** Season used for existing live data until later phases add season creation. */
export const DEFAULT_SEASON_YEAR = 2026;

/** Newest first, current season always on top. */
export function sortSeasons(seasons: LeagueSeason[]): LeagueSeason[] {
  return [...seasons].sort((a, b) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
    return b.season_year - a.season_year;
  });
}

/**
 * Resolve the season a screen should show by default.
 * Order: explicit selection -> flagged current -> newest -> DEFAULT_SEASON_YEAR match.
 */
export function resolveCurrentSeason(
  seasons: LeagueSeason[],
  selectedId?: string | null,
): LeagueSeason | null {
  if (!seasons.length) return null;
  if (selectedId) {
    const picked = seasons.find((s) => s.id === selectedId);
    if (picked) return picked;
  }
  return (
    seasons.find((s) => s.is_current) ??
    sortSeasons(seasons)[0] ??
    seasons.find((s) => s.season_year === DEFAULT_SEASON_YEAR) ??
    null
  );
}

export function seasonLabel(season: LeagueSeason | null | undefined): string {
  if (!season) return String(DEFAULT_SEASON_YEAR);
  return season.label || String(season.season_year);
}
