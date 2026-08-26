export type EffectiveScoringMode = "standard" | "time_capped_points" | "swiss";
export type EffectiveMatchType = "singles" | "doubles" | "mixed";
export type EffectiveWinCondition = "win_by_2" | "sudden_death";

export interface EffectiveTournamentSettings {
  scoringMode: EffectiveScoringMode;
  pointsPerGame: 11 | 15;
  bestOf: 3 | 5;
  playAllGames: boolean;
  winCondition: EffectiveWinCondition;
  matchType: EffectiveMatchType;
  isDoubles: boolean;
}

function mapValue(map: unknown, groupNumber: number | string | null | undefined): unknown {
  if (!map || groupNumber == null || typeof map !== "object") return undefined;
  return (map as Record<string, unknown>)[String(groupNumber)];
}

function scoringMode(raw: unknown): EffectiveScoringMode | null {
  return raw === "time_capped_points" || raw === "swiss" || raw === "standard" ? raw : null;
}

function matchType(raw: unknown): EffectiveMatchType | null {
  return raw === "doubles" || raw === "mixed" || raw === "singles" ? raw : null;
}

function points(raw: unknown): 11 | 15 | null {
  const n = Number(raw);
  if (n === 15) return 15;
  if (n === 11) return 11;
  return null;
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
    pointsPerGame:
      points(mapValue(tournament?.league_points_per_game, groupNumber)) ??
      points(tournament?.points_per_game) ??
      11,
    bestOf:
      bestOf(mapValue(tournament?.league_best_of, groupNumber)) ??
      bestOf(tournament?.best_of) ??
      5,
    playAllGames:
      typeof mapValue(tournament?.league_play_all_games, groupNumber) === "boolean"
        ? Boolean(mapValue(tournament?.league_play_all_games, groupNumber))
        : Boolean(tournament?.play_all_games),
    winCondition:
      winCondition(mapValue(tournament?.league_win_conditions, groupNumber)) ??
      winCondition(tournament?.win_condition) ??
      "win_by_2",
    matchType: type,
    isDoubles: type === "doubles" || type === "mixed",
  };
}
