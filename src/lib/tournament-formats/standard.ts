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

  markerLabel: "Mark",

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

    if (match.game_scores) {
      try {
        const gs = JSON.parse(match.game_scores);
        const sets = (gs.sets || []) as Array<{ a?: number; b?: number }>;
        sets.forEach((s) => {
          if (isA) {
            stats.gamesWon += s.a || 0;
            stats.gamesLost += s.b || 0;
          } else {
            stats.gamesWon += s.b || 0;
            stats.gamesLost += s.a || 0;
          }
        });
      } catch {
        /* ignore malformed JSON */
      }
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
