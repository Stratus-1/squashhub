/**
 * TournamentFormat — pluggable scoring/standings strategy.
 *
 * Phase 1 carved out a registry for non-default formats (Bells).
 * Phase 2 promotes Standard into its own strategy so every UI surface
 * (marker route, marker label, standings columns, badges) reads from
 * the strategy instead of hard-coding `if (scoring_mode === '…')`.
 *
 * Extend this interface as new formats land — but keep additions
 * optional or supply defaults for both Standard and Bells so existing
 * call sites don't have to fan out.
 */

export type StandingsStats = {
  played: number;
  won: number;
  lost: number;
  gamesWon: number;
  gamesLost: number;
  byes: number;
  pointsFor: number;
  pointsAgainst: number;
};

export type StandingsRow = StandingsStats & {
  gameDiff: number;
  pointsDiff: number;
  points: number; // standard tournament points (2/win, 1/draw…)
  [key: string]: any;
};

export type ChampLike = {
  id?: string;
  scoring_mode?: string | null;
  match_duration_minutes?: number | null;
  group_durations?: Record<string, number> | null;
  match_type?: string | null;
  [key: string]: any;
};

export type MatchLike = {
  id?: string;
  side_a_points?: number | null;
  side_b_points?: number | null;
  group_number?: number | null;
  player_a_member_id?: string | null;
  player_b_member_id?: string | null;
  partner_a_member_id?: string | null;
  partner_b_member_id?: string | null;
  winner_member_id?: string | null;
  status?: string | null;
  score?: string | null;
  game_scores?: string | null;
  [key: string]: any;
};

/** Trailing standings column (after the universal P / W / L columns). */
export type StandingsColumn = {
  key: string;
  /** Short header label (e.g. "GD", "PF"). */
  label: string;
  /** Tooltip / aria title (e.g. "Game Difference"). */
  title?: string;
  /** Cell text for one row. */
  render(row: StandingsRow): string;
  /** Optional cell tailwind classes appended to `py-2 text-center`. */
  cellClassName?: string;
};

/** Small badge shown next to a match (e.g. "Bells"). */
export type FormatBadge = {
  label: string;
  variant?: "default" | "secondary" | "outline" | "destructive";
};

export interface TournamentFormat {
  /** Stable key persisted in club_champs.scoring_mode. */
  readonly key: string;
  /** Human label for admin UIs. */
  readonly label: string;
  /** Short helper text shown under the picker. */
  readonly description?: string;

  /** Does this format require doubles pairs? */
  readonly requiresDoubles: boolean;

  /** Route to send a user to when they tap "Mark / Score" on a match. */
  markerRoute(matchId: string): string;

  /** Button label on the marker CTA (e.g. "Mark", "Bell"). */
  readonly markerLabel: string;

  /** Optional badge to render next to a match in list views. */
  readonly badge?: FormatBadge;

  /**
   * Per-match time cap in minutes (Bells uses group_durations[group_number]
   * with fallback to champ.match_duration_minutes). Returns null when the
   * format isn't time-capped.
   */
  getTimeCapMinutes(champ: ChampLike, groupNumber: number | null | undefined): number | null;

  /**
   * Accumulate one completed match's contribution to a given member's
   * standings stats. Mutates `stats` in place. Returns true if the match
   * was actually credited (member was a participant).
   */
  applyMatchToStats(stats: StandingsStats, match: MatchLike, memberId: string, isDoubles: boolean): boolean;

  /** Final sort comparator for standings rows. */
  rankStandings(a: StandingsRow, b: StandingsRow): number;

  /** Trailing columns (after P/W/L) shown in standings tables. */
  readonly standingsColumns: readonly StandingsColumn[];

  /** Pretty score string for a finished match (e.g. "15-12"). */
  formatScore(pointsA: number, pointsB: number): string;

  /** Resolve winner_member_id for a finished match given the final points. */
  resolveWinnerMemberId(match: MatchLike, pointsA: number, pointsB: number): string | null;
}
