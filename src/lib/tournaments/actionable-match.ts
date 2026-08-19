/**
 * Match-level lifecycle rules for "is this match markable right now?".
 *
 * A match is only offered in the Match Marker's source pickers when ALL of
 * these hold:
 *  - the PARENT competition is genuinely current (not completed/cancelled/past),
 *  - the MATCH itself is in a non-terminal state (not played, forfeited, etc.),
 *  - the match has a real schedule anchor that is not in the past.
 *
 * Child status alone is never enough: tournaments routinely finish with stale
 * `scheduled` child rows left behind.
 */
import { isCurrentTournament, type TournamentLike } from "./lifecycle";

/** Match statuses that mean "nothing left to mark". */
export const TERMINAL_MATCH_STATUSES = new Set([
  "completed",
  "complete",
  "finished",
  "played",
  "cancelled",
  "canceled",
  "abandoned",
  "archived",
  "forfeit",
  "forfeited",
  "walkover",
  "wo",
  "no_show",
  "noshow",
  "no-show",
  "withdrawn",
  "withdrawal",
  "void",
  "voided",
  "bye",
  "postponed",
  "deleted",
]);

/** Statuses that are safe to mark (anything else unknown is treated as terminal). */
export const MARKABLE_MATCH_STATUSES = new Set(["scheduled", "in_progress", "pending", "ready"]);

export interface MatchLike {
  status?: string | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
}

const norm = (s?: string | null) => String(s || "").toLowerCase().trim();

export const isTerminalMatchStatus = (status?: string | null): boolean => {
  const s = norm(status);
  if (!s) return false;
  if (TERMINAL_MATCH_STATUSES.has(s)) return true;
  return !MARKABLE_MATCH_STATUSES.has(s);
};

/** No usable date to place the match in time. */
export const isUnscheduledMatch = (m: MatchLike): boolean => !m.scheduled_date;

/**
 * True when the match's own schedule is not in the past.
 * A match already `in_progress` stays actionable on its own day even if the
 * clock has moved on, but never on an earlier day.
 */
export const isMatchDateActionable = (m: MatchLike, today: string): boolean =>
  !!m.scheduled_date && m.scheduled_date >= today;

export interface ActionableOptions {
  /** Include rows with no scheduled date (admin-only "Unscheduled" surfaces). */
  includeUnscheduled?: boolean;
  today?: string;
}

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Can this tournament match be marked now?
 * `parent` is the tournament row (status + dates); when it is missing we refuse,
 * because we cannot prove the parent is current.
 */
export function isActionableTournamentMatch(
  match: MatchLike,
  parent: TournamentLike | null | undefined,
  opts: ActionableOptions = {},
): boolean {
  const today = opts.today ?? todayStr();
  if (!parent) return false;
  if (!isCurrentTournament(parent, today)) return false;
  if (isTerminalMatchStatus(match.status)) return false;
  if (isUnscheduledMatch(match)) return !!opts.includeUnscheduled;
  return isMatchDateActionable(match, today);
}

export interface FixtureLike {
  status?: string | null;
  fixture_date?: string | null;
}

/** League fixtures: same defensive rules, using `fixture_date`. */
export function isActionableLeagueFixture(
  fixture: FixtureLike,
  opts: ActionableOptions = {},
): boolean {
  const today = opts.today ?? todayStr();
  const s = norm(fixture.status);
  // League fixtures often carry no status at all until a result is posted.
  if (s && TERMINAL_MATCH_STATUSES.has(s)) return false;
  if (!fixture.fixture_date) return !!opts.includeUnscheduled;
  return fixture.fixture_date >= today;
}
