/**
 * "Please make your court booking" reminder.
 *
 * A player selected for a tournament/championship round must book a court and
 * later enter the result. This module holds the pure rule for deciding which
 * of a member's matches still need a court booking, so the dashboard nudge can
 * be tested without the database.
 */
import { isMatchTerminal, isParticipant, isUnscheduled, type SelfScheduleMatchLike } from "./self-schedule";

export interface ReminderMatch extends SelfScheduleMatchLike {
  champ_id?: string | null;
}

/** Matches where this member still has to arrange a court/date/time. */
export function matchesNeedingBooking(
  matches: ReminderMatch[],
  memberId?: string | null,
): ReminderMatch[] {
  if (!memberId) return [];
  return matches.filter(
    (m) => isParticipant(m, memberId) && !isMatchTerminal(m) && isUnscheduled(m),
  );
}

/** Player-facing nudge text, or null when nothing is outstanding. */
export function bookingReminderMessage(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "Please make your court booking for your next upcoming game."
    : `Please make your court bookings — you have ${count} games without a court yet.`;
}
