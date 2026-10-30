import { parseServingMethod, type DoublesServingMethod } from "@/lib/marker/doubles-serving";

export type EffectiveScoringMode = "standard" | "time_capped_points" | "swiss" | "first_to_target";
export type EffectiveMatchType = "singles" | "doubles" | "mixed";
export type EffectiveWinCondition = "win_by_2" | "sudden_death";
export type PlayoffMatchFormat = "bo3" | "bo5" | "all3" | "all5";
export function parsePlayoffMatchFormat(value: unknown): PlayoffMatchFormat | null {
  return value === "bo3" || value === "bo5" || value === "all3" || value === "all5" ? value : null;
}
export function playoffMatchFormat(tournament: any, groupNumber: number | string | null | undefined): PlayoffMatchFormat | null {
  return parsePlayoffMatchFormat(mapValue(tournament?.league_playoff_match_formats, groupNumber));
}
/** Apply playoff-only overrides without changing the pool settings or the independent PAR choice. */
export function applyPlayoffSettings(settings: EffectiveTournamentSettings, tournament: any, groupNumber: number | string | null | undefined): EffectiveTournamentSettings {
  if (settings.scoringMode !== "standard" && settings.scoringMode !== "swiss") return settings;
  const format = playoffMatchFormat(tournament, groupNumber);
  return { ...settings, pointsPerGame: playoffPointsPerGame(tournament, groupNumber) ?? settings.pointsPerGame,
    bestOf: format ? (format.endsWith("5") ? 5 : 3) : settings.bestOf,
    playAllGames: format ? format.startsWith("all") : settings.playAllGames };
}

export interface EffectiveTournamentSettings {
  scoringMode: EffectiveScoringMode;
  pointsPerGame: number;
  bestOf: 1 | 3 | 5;
  playAllGames: boolean;
  winCondition: EffectiveWinCondition;
  matchType: EffectiveMatchType;
  isDoubles: boolean;
  /** null = organiser hasn't chosen one → marker falls back to manual serving. */
  doublesServingMethod: DoublesServingMethod | null;
}

function mapValue(map: unknown, groupNumber: number | string | null | undefined): unknown {
  if (!map || groupNumber == null || typeof map !== "object") return undefined;
  return (map as Record<string, unknown>)[String(groupNumber)];
}

function scoringMode(raw: unknown): EffectiveScoringMode | null {
  return raw === "first_to_target" || raw === "time_capped_points" || raw === "swiss" || raw === "standard" ? raw : null;
}

function matchType(raw: unknown): EffectiveMatchType | null {
  return raw === "doubles" || raw === "mixed" || raw === "singles" ? raw : null;
}

function points(raw: unknown): 7 | 11 | 15 | null {
  const n = Number(raw);
  if (n === 15) return 15;
  if (n === 7) return 7;
  if (n === 11) return 11;
  return null;
}

/**
 * Per-category play-off game length override. Null/absent = "Keep same format
 * as pools" — play-offs use the category's own PAR. A value of 7, 11 or 15
 * makes that category's quarterfinals, semifinals and finals play to it instead.
 * Values are database-validated; anything unexpected reads as "no override".
 */
export function playoffPointsPerGame(tournament: any, groupNumber: number | string | null | undefined): 7 | 11 | 15 | null {
  return points(mapValue(tournament?.league_playoff_points_per_game, groupNumber));
}

function bestOf(raw: unknown): 3 | 5 | null {
  const n = Number(raw);
  if (n === 5) return 5;
  if (n === 3) return 3;
  return null;
}

function winCondition(raw: unknown): EffectiveWinCondition | null {
  return raw === "sudden_death" || raw === "win_by_2" ? raw : null;
}

/**
 * Resolve the rules that apply to one tournament match.
 *
 * Modern tournaments can have different formats per division. The match's
 * group_number selects those league_* overrides; tournament-wide rules are
 * kept as fallback for older events and compatibility views.
 */
export function effectiveTournamentSettings(
  tournament: any,
  groupNumber: number | string | null | undefined,
): EffectiveTournamentSettings {
  const mode =
    scoringMode(mapValue(tournament?.league_scoring_modes, groupNumber)) ??
    scoringMode(tournament?.scoring_mode) ??
    "standard";
  const type =
    matchType(mapValue(tournament?.league_match_types, groupNumber)) ??
    matchType(tournament?.match_type) ??
    "singles";

  return {
    scoringMode: mode,
    pointsPerGame: mode === "first_to_target" ? Math.max(1, Math.floor(Number(mapValue(tournament?.league_points_per_game, groupNumber)) || 7)) :
      points(mapValue(tournament?.league_points_per_game, groupNumber)) ??
      points(tournament?.points_per_game) ??
      11,
    bestOf: mode === "first_to_target" ? 1 :
      bestOf(mapValue(tournament?.league_best_of, groupNumber)) ??
      bestOf(tournament?.best_of) ??
      5,
    playAllGames: mode === "first_to_target" ? false :
      typeof mapValue(tournament?.league_play_all_games, groupNumber) === "boolean"
        ? Boolean(mapValue(tournament?.league_play_all_games, groupNumber))
        : Boolean(tournament?.play_all_games),
    winCondition: mode === "first_to_target" ? (winCondition(mapValue(tournament?.league_win_conditions, groupNumber)) ?? "sudden_death") :
      winCondition(mapValue(tournament?.league_win_conditions, groupNumber)) ??
      winCondition(tournament?.win_condition) ??
      "win_by_2",
    matchType: type,
    isDoubles: type === "doubles" || type === "mixed",
    doublesServingMethod:
      parseServingMethod(mapValue(tournament?.league_doubles_serving_methods, groupNumber)) ??
      parseServingMethod(tournament?.doubles_serving_method),
  };
}
