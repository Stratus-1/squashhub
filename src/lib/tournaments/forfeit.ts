/**
 * Per-league forfeit / no-show handling.
 *
 * The consequence of a no-show depends on how the league is scored, so the rule
 * lives on the LEAGUE (tournaments.league_forfeit_rules / league_forfeit_points),
 * not on the tournament. The legacy tournament-wide
 * `tournament_rules.no_show_opponent_points` / `no_show_player_points` fields are
 * kept for compatibility only: they seed the per-league defaults of existing
 * tournaments and are never shown in normal UI.
 */

export type ForfeitRule = "walkover_win" | "award_points" | "neutral";
export type LeagueScoring = "standard" | "time_capped_points";

export interface ForfeitPoints {
  opponent: number;
  player: number;
}

export type ForfeitRuleMap = Record<string, ForfeitRule>;
export type ForfeitPointsMap = Record<string, ForfeitPoints>;

export interface ForfeitOption {
  value: ForfeitRule;
  label: string;
  hint: string;
}

/** Sentinel written into `score` for a neutral (no-result) forfeit. */
export const VOID_SCORE_PREFIX = "No result";

/**
 * Which rules make sense for a league, derived from its scoring format.
 * Standard best-of squash has no meaningful "award 10 points" outcome, so the
 * points option is only offered where the format itself is points-based.
 */
export function forfeitOptionsForScoring(scoring: LeagueScoring): ForfeitOption[] {
  if (scoring === "time_capped_points") {
    return [
      {
        value: "award_points",
        label: "Award points",
        hint: "Opponent banks a fixed points score, the absent player records theirs. Matches the points-based Bells standings.",
      },
      {
        value: "walkover_win",
        label: "Walkover win",
        hint: "Opponent is credited with the win; no points are added to either total.",
      },
      {
        value: "neutral",
        label: "No result",
        hint: "Game is closed out and ignored in the standings — neither player is helped or hurt.",
      },
    ];
  }
  return [
    {
      value: "walkover_win",
      label: "Walkover win to opponent",
      hint: "Opponent wins in straight games (a normal squash walkover). Counts as a win with game difference in the standings.",
    },
    {
      value: "neutral",
      label: "No result",
      hint: "Game is closed out and ignored in the standings — neither player is helped or hurt.",
    },
  ];
}

export function defaultForfeitRule(scoring: LeagueScoring): ForfeitRule {
  return scoring === "time_capped_points" ? "award_points" : "walkover_win";
}

/** Rule for one league, falling back to the format default. */
export function ruleForLeague(
  rules: ForfeitRuleMap | null | undefined,
  leagueNumber: number | null | undefined,
  scoring: LeagueScoring,
): ForfeitRule {
  const raw = rules?.[String(leagueNumber ?? 1)];
  const allowed = forfeitOptionsForScoring(scoring).map((o) => o.value);
  if (raw && allowed.includes(raw)) return raw;
  return defaultForfeitRule(scoring);
}

/**
 * Points for one league. Existing tournaments fall back to the legacy
 * tournament-wide values so nothing changes for events already running.
 */
export function pointsForLeague(
  points: ForfeitPointsMap | null | undefined,
  leagueNumber: number | null | undefined,
  legacy?: { opponent?: number | null; player?: number | null },
): ForfeitPoints {
  const row = points?.[String(leagueNumber ?? 1)];
  return {
    opponent: Number(row?.opponent ?? legacy?.opponent ?? 10) || 0,
    player: Number(row?.player ?? legacy?.player ?? 0) || 0,
  };
}

/** A completed match that must be ignored by standings / qualification. */
export function isVoidResult(match: { score?: string | null; status?: string | null }): boolean {
  return typeof match?.score === "string" && match.score.startsWith(VOID_SCORE_PREFIX);
}

export interface ForfeitPayloadArgs {
  match: {
    id?: string;
    player_a_member_id?: string | null;
    player_b_member_id?: string | null;
    group_number?: number | null;
  };
  absentMemberId: string;
  rule: ForfeitRule;
  /** Points used by the `award_points` rule only. */
  points: ForfeitPoints;
  /** Games needed to take a walkover win (best-of 3 → 2, best-of 5 → 3). */
  bestOf?: number;
  /** Points per game for the walkover scoreline (e.g. 11 or 15). */
  pointsPerGame?: number;
}

/**
 * Build the `club_champs_matches` update for a forfeit, honouring the league rule.
 * Every consumer (marker routes, admin scorecards, cascades) goes through here so
 * result entry, standings and playoff qualification stay consistent.
 */
export function buildForfeitPayload({
  match,
  absentMemberId,
  rule,
  points,
  bestOf = 3,
  pointsPerGame = 11,
}: ForfeitPayloadArgs): Record<string, any> {
  const absentIsA = match.player_a_member_id === absentMemberId;
  const opponentId = absentIsA ? match.player_b_member_id : match.player_a_member_id;

  if (rule === "neutral") {
    return {
      status: "completed",
      winner_member_id: null,
      side_a_points: 0,
      side_b_points: 0,
      score: `${VOID_SCORE_PREFIX} — ${absentIsA ? "A" : "B"} no show`,
      game_scores: null,
      forfeit_member_id: absentMemberId,
    };
  }

  if (rule === "award_points") {
    return {
      status: "completed",
      winner_member_id: opponentId ?? null,
      side_a_points: absentIsA ? points.player : points.opponent,
      side_b_points: absentIsA ? points.opponent : points.player,
      score: absentIsA ? "No show (B w/o)" : "No show (A w/o)",
      game_scores: null,
      forfeit_member_id: absentMemberId,
    };
  }

  // walkover_win — straight-games win to the opponent, scored like a normal squash walkover.
  const gamesNeeded = Math.max(1, Math.ceil((Number(bestOf) || 3) / 2));
  const per = Math.max(1, Number(pointsPerGame) || 11);
  const sets = Array.from({ length: gamesNeeded }, () =>
    absentIsA ? { a: 0, b: per } : { a: per, b: 0 },
  );
  return {
    status: "completed",
    winner_member_id: opponentId ?? null,
    side_a_points: absentIsA ? 0 : gamesNeeded,
    side_b_points: absentIsA ? gamesNeeded : 0,
    score: absentIsA ? `0-${gamesNeeded} (w/o)` : `${gamesNeeded}-0 (w/o)`,
    game_scores: JSON.stringify({ sets, walkover: true }),
    forfeit_member_id: absentMemberId,
  };
}

/** One-line admin summary of a league's rule. */
export function describeForfeitRule(rule: ForfeitRule, points: ForfeitPoints): string {
  if (rule === "award_points") return `Award ${points.opponent} pts / ${points.player} pts`;
  if (rule === "neutral") return "No result";
  return "Walkover win";
}
