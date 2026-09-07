/**
 * Provisional ranking status.
 *
 * Each ranking system in SquashHub is independent: a player can be OFFICIAL on
 * the club ranking while still PROVISIONAL on the regional (association) or
 * national list. Every scope carries its own configurable starting value and
 * match threshold, so nothing here reads from another scope's settings.
 */

export type RankingScope = "club" | "association" | "national";

export const RANKING_SCOPE_LABELS: Record<RankingScope, string> = {
  club: "Club ranking",
  association: "Regional ranking",
  national: "National ranking",
};

export interface ProvisionalSettings {
  /** When false every player is treated as official immediately. */
  enabled: boolean;
  /** Points a player starts on while provisional (e.g. 600). */
  startPoints: number;
  /** Ranked matches required before the status becomes official. */
  minMatches: number;
}

export const DEFAULT_PROVISIONAL: ProvisionalSettings = {
  enabled: true,
  startPoints: 600,
  minMatches: 5,
};

export type RankingStatus = "provisional" | "official";

export function rankingStatus(
  matchesPlayed: number,
  settings: ProvisionalSettings = DEFAULT_PROVISIONAL,
): RankingStatus {
  if (!settings.enabled) return "official";
  return (matchesPlayed ?? 0) >= Math.max(0, settings.minMatches) ? "official" : "provisional";
}

/**
 * Points shown to the player. While provisional the earned points sit on top of
 * the configured starting value; once official the stored balance stands alone.
 */
export function effectiveRankingPoints(
  earnedPoints: number,
  matchesPlayed: number,
  settings: ProvisionalSettings = DEFAULT_PROVISIONAL,
): number {
  const earned = Number(earnedPoints ?? 0);
  return rankingStatus(matchesPlayed, settings) === "provisional"
    ? settings.startPoints + earned
    : earned;
}

export function matchesRemaining(
  matchesPlayed: number,
  settings: ProvisionalSettings = DEFAULT_PROVISIONAL,
): number {
  if (!settings.enabled) return 0;
  return Math.max(0, settings.minMatches - (matchesPlayed ?? 0));
}

/** Which ranking system a competition counts towards, based on who owns it. */
export function defaultRankingScopeForOwner(
  ownerScope: "club" | "association" | "federation" | null | undefined,
): RankingScope {
  if (ownerScope === "association") return "association";
  if (ownerScope === "federation") return "national";
  return "club";
}
