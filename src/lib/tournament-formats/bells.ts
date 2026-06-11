import type {
  ChampLike,
  MatchLike,
  StandingsRow,
  StandingsStats,
  TournamentFormat,
} from "./types";

/**
 * Bells — time-capped doubles round-robin, ranked by total points scored.
 *
 * Persisted as `club_champs.scoring_mode = 'time_capped_points'`.
 * Time cap per league lives in `club_champs.group_durations[group_number]`
 * with fallback to `club_champs.match_duration_minutes`.
 */
export const BellsFormat: TournamentFormat = {
  key: "time_capped_points",
  label: "Bells — time-capped, ranked by points scored",
  description:
    "Players (singles or doubles pairs) play until a per-league bell rings. Standings ranked by total points scored.",
  requiresDoubles: false,

  markerRoute(matchId) {
    return `/bells-marker/${matchId}`;
  },

  markerLabel: "Bell",

  badge: { label: "Bells", variant: "secondary" },

  getTimeCapMinutes(champ: ChampLike, groupNumber) {
    if (!champ) return null;
    const slotMap = (champ.group_durations || {}) as Record<string, number>;
    const breakMap = ((champ as any).group_break_minutes || {}) as Record<string, number>;
    const fromGroup = groupNumber != null ? Number(slotMap[String(groupNumber)]) : 0;
    const slot = fromGroup > 0
      ? fromGroup
      : (Number(champ.match_duration_minutes) > 0 ? Number(champ.match_duration_minutes) : 30);
    const groupBreakRaw = groupNumber != null ? Number(breakMap[String(groupNumber)]) : NaN;
    const breakMin = Number.isFinite(groupBreakRaw) && groupBreakRaw >= 0
      ? groupBreakRaw
      : Math.max(0, Number((champ as any).default_break_minutes) || 0);
    return Math.max(1, slot - breakMin);
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
    const a = Number(match.side_a_points) || 0;
    const b = Number(match.side_b_points) || 0;
    if (isA) {
      stats.pointsFor += a;
      stats.pointsAgainst += b;
    } else {
      stats.pointsFor += b;
      stats.pointsAgainst += a;
    }
    if (a > b) {
      if (isA) stats.won += 1;
      else stats.lost += 1;
    } else if (b > a) {
      if (isB) stats.won += 1;
      else stats.lost += 1;
    }
    return true;
  },

  rankStandings(a: StandingsRow, b: StandingsRow) {
    return (
      b.pointsFor - a.pointsFor ||
      b.pointsDiff - a.pointsDiff ||
      b.played - a.played
    );
  },

  standingsColumns: [
    {
      key: "pointsFor",
      label: "PF",
      title: "Points For",
      cellClassName: "font-semibold",
      render: (row) => `${row.pointsFor}`,
    },
    {
      key: "pointsAgainst",
      label: "PA",
      title: "Points Against",
      cellClassName: "text-muted-foreground",
      render: (row) => `${row.pointsAgainst}`,
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
