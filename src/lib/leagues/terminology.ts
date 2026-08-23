/**
 * User-facing league terminology.
 *
 * Two distinct concepts, one shared database model:
 *  - SYSTEM LEAGUE — a league that exists on the platform and is shared across
 *    clubs (stored as `league_associations.scope = 'region'`, usually linked to
 *    a platform association). Clubs join these; they cannot create them.
 *  - CLUB LEAGUE — a league the club owns and runs itself (stored as
 *    `league_associations.scope = 'internal'`).
 *
 * The database keeps its existing `internal` / `region` scope values — renaming
 * those would break NSA sync, historical rows and every RLS policy that reads
 * them. Everything here is presentation only.
 */

export const SYSTEM_LEAGUE = "System League";
export const SYSTEM_LEAGUES = "System Leagues";
export const CLUB_LEAGUE = "Club League";
export const CLUB_LEAGUES = "Club Leagues";

export const SELECT_OR_CREATE_COPY =
  "Select a System League or create your own Club League.";

export type LeagueScope = "internal" | "region" | "national" | string | null | undefined;

/** True when the scope value represents a club-owned (internal) league. */
export function isClubLeagueScope(scope: LeagueScope): boolean {
  return scope === "internal";
}

/** Badge/label text for a league's kind. */
export function leagueKindLabel(scope: LeagueScope): string {
  return isClubLeagueScope(scope) ? CLUB_LEAGUE : SYSTEM_LEAGUE;
}

/** Plural label for a list heading. */
export function leagueKindLabelPlural(scope: LeagueScope): string {
  return isClubLeagueScope(scope) ? CLUB_LEAGUES : SYSTEM_LEAGUES;
}

/** The three Club League setup steps, in order. */
export const CLUB_LEAGUE_STEPS = [
  {
    id: "leagues",
    label: "Create League",
    description:
      "Step one — select a System League or create your own Club League, then choose its format (Singles, Doubles or Hybrid), category and season settings.",
  },
  {
    id: "teams",
    label: "Create League Teams",
    description:
      "Step two — create the teams inside that league (1st, 2nd, 3rd…) and allocate players, or pairs for Doubles and Hybrid formats.",
  },
  {
    id: "fixtures",
    label: "Create Rounds & Fixtures",
    description:
      "Step three — create the season's rounds and fixtures for that league using those teams.",
  },
] as const;

export type ClubLeagueStepId = (typeof CLUB_LEAGUE_STEPS)[number]["id"];
