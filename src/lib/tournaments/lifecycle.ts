/**
 * Shared tournament lifecycle rules.
 *
 * A member-facing "Current" list must only ever contain genuine tournament
 * entities that are running now or still to come. Everything else — finished
 * by status, cancelled/abandoned/archived, or already past its last playing
 * day — belongs under Past/History. Tournaments with no usable dates are not
 * "current": they are unfinished admin setup and are surfaced separately.
 */

export interface TournamentLike {
  id?: string;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

/** Statuses that always mean "not current", regardless of dates. */
export const PAST_TOURNAMENT_STATUSES = new Set([
  "completed",
  "cancelled",
  "canceled",
  "abandoned",
  "archived",
]);

export const CANCELLED_TOURNAMENT_STATUSES = new Set(["cancelled", "canceled", "abandoned"]);

export const todayISO = (now: Date = new Date()): string => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const statusOf = (t: TournamentLike) => String(t.status || "").toLowerCase().trim();

/** True when the row has no usable scheduling dates at all. */
export const needsDates = (t: TournamentLike): boolean => !t.start_date && !t.end_date;

/** Finished, cancelled, or the last playing day is behind us. */
export const isPastTournament = (t: TournamentLike, today: string = todayISO()): boolean => {
  if (PAST_TOURNAMENT_STATUSES.has(statusOf(t))) return true;
  // Prefer the end date; fall back to the start date for single-day events.
  const last = t.end_date || t.start_date;
  return !!last && last < today;
};

export const isCancelledTournament = (t: TournamentLike): boolean =>
  CANCELLED_TOURNAMENT_STATUSES.has(statusOf(t));

/**
 * Member-facing "Current & upcoming". Requires a real date anchor — an
 * undated row can never prove it is current.
 */
export const isCurrentTournament = (t: TournamentLike, today: string = todayISO()): boolean => {
  if (needsDates(t)) return false;
  return !isPastTournament(t, today);
};

/** Genuine tournament rows that are missing dates (admin setup state). */
export const isNeedsDatesTournament = (t: TournamentLike): boolean =>
  needsDates(t) && !PAST_TOURNAMENT_STATUSES.has(statusOf(t));

/** Running right now sorts first, then the soonest start date. */
export const compareCurrentTournaments = (
  a: TournamentLike,
  b: TournamentLike,
  today: string = todayISO(),
): number => {
  const running = (t: TournamentLike) =>
    t.start_date && t.start_date <= today && (!t.end_date || t.end_date >= today) ? 0 : 1;
  const r = running(a) - running(b);
  if (r !== 0) return r;
  return (a.start_date || "9999-12-31").localeCompare(b.start_date || "9999-12-31");
};

export function splitTournamentsByLifecycle<T extends TournamentLike>(
  rows: T[],
  today: string = todayISO(),
): { current: T[]; past: T[]; needsDates: T[] } {
  const current: T[] = [];
  const past: T[] = [];
  const undated: T[] = [];
  for (const row of rows) {
    if (isNeedsDatesTournament(row)) undated.push(row);
    else if (isPastTournament(row, today)) past.push(row);
    else if (isCurrentTournament(row, today)) current.push(row);
    else past.push(row);
  }
  current.sort((a, b) => compareCurrentTournaments(a, b, today));
  past.sort((a, b) =>
    ((b.end_date || b.start_date) || "").localeCompare((a.end_date || a.start_date) || ""),
  );
  return { current, past, needsDates: undated };
}
