import { gameSetsOf } from "../tournaments/tie-breaks";
import type {
  ChampLike,
  MatchLike,
  StandingsRow,
  StandingsStats,
  TournamentFormat,
} from "./types";

/**
 * Standard — classic Club Champs format. Win/loss based ranking with
 * tournament points (2/win, 1/draw) and per-game points pulled from the
 * `game_scores` JSON column.
 *
 * Persisted as `club_champs.scoring_mode = 'standard'` (or null/legacy).
 */
export const StandardFormat: TournamentFormat = {
  key: "standard",
  label: "Standard — best-of games, ranked by tournament points",
  description:
    "Classic round-robin or knockout. Win/loss with tournament points and game difference as tiebreaker.",
  requiresDoubles: false,

  markerRoute(matchId) {
    return `/match-marker?source=tournament&matchId=${matchId}`;
  },

  markerLabel: "Mark game",

  getTimeCapMinutes() {
    return null;
  },

  applyMatchToStats(stats: StandingsStats, match: MatchLike, memberId: string, isDoubles: boolean) {
    const isA =
      match.player_a_member_id === memberId ||
      (isDoubles && match.partner_a_member_id === memberId);
    const isB =
      match.player_b_member_id === memberId ||
      (isDoubles && match.partner_b_member_id === memberId);
    if (!isA && !isB) return false;

    stats.played += 1;

    // Doubles: winner_member_id is one of the two named players on the winning side.
    const wonByPair =
      match.winner_member_id === memberId ||
      (isDoubles &&
        ((isA && match.winner_member_id === match.player_a_member_id) ||
          (isB && match.winner_member_id === match.player_b_member_id)));

    if (wonByPair) stats.won += 1;
    else stats.lost += 1;

    let gameScores: unknown = match.game_scores;
    if (typeof gameScores === "string") {
      try { gameScores = JSON.parse(gameScores); }
      catch { gameScores = null; }
    }
    // The shared parser falls back to saved score text when set JSON is absent.
    const detail = gameSetsOf({ ...match, game_scores: gameScores });
    for (const s of detail.sets ?? []) {
      const myPts = isA ? s.a : s.b;
      const oppPts = isA ? s.b : s.a;
      if (detail.pointsKnown) {
        stats.pointsFor += myPts;
        stats.pointsAgainst += oppPts;
      }
      if (myPts > oppPts) stats.gamesWon += 1;
      else if (oppPts > myPts) stats.gamesLost += 1;
    }

    return true;
  },

  rankStandings(a: StandingsRow, b: StandingsRow) {
    return (
      b.points - a.points ||
      b.gameDiff - a.gameDiff ||
      b.won - a.won
    );
  },

  standingsColumns: [
    {
      key: "gamesWon",
      label: "GF",
      title: "Games for (sets won)",
      cellClassName: "text-xs text-muted-foreground",
      render: (row) => `${row.gamesWon ?? 0}`,
    },
    {
      key: "gamesLost",
      label: "GA",
      title: "Games against (sets lost)",
      cellClassName: "text-xs text-muted-foreground",
      render: (row) => `${row.gamesLost ?? 0}`,
    },
    {
      key: "gameDiff",
      label: "GD",
      title: "Game Difference",
      cellClassName: "text-xs text-muted-foreground",
      render: (row) => (row.gameDiff > 0 ? `+${row.gameDiff}` : `${row.gameDiff}`),
    },
    {
      key: "points",
      label: "Pts",
      title: "Tournament Points",
      cellClassName: "font-semibold",
      render: (row) => `${row.points}`,
    },
  ],

  formatScore(pointsA, pointsB) {
    return `${pointsA}-${pointsB}`;
  },

  resolveWinnerMemberId(match, pointsA, pointsB) {
    if (pointsA > pointsB) return match.player_a_member_id ?? null;
    if (pointsB > pointsA) return match.player_b_member_id ?? null;
    return null;
  },
};

export type { ChampLike };
