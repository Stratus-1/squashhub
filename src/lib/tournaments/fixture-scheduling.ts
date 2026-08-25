/**
 * Admin/organiser scheduling of an individual tournament fixture.
 *
 * Every generated fixture — initial pool rounds, generated next rounds,
 * semi-finals and finals alike — can be given a court/date/time, moved to a
 * different slot, or have its slot cleared again. Clearing NEVER deletes the
 * fixture or its result: it only detaches the court booking.
 *
 * Pure logic so the row UI and the regression tests share one definition.
 */

import {
  isMatchTerminal,
  isParticipant,
  isUnscheduled,
  isSlotFreeForMatch,
  type BookingLike,
  type SelfScheduleMatchLike,
} from "./self-schedule";

export type FixtureScheduleState = "unschedulable" | "unscheduled" | "scheduled";

export interface FixtureLike extends SelfScheduleMatchLike {
  id?: string;
  booking_id?: string | null;
}

/** Where a fixture sits on the schedule spectrum. */
export function fixtureScheduleState(m: FixtureLike): FixtureScheduleState {
  if (m.is_bye) return "unschedulable";
  return isUnscheduled(m) ? "unscheduled" : "scheduled";
}

export interface FixtureSchedulePermission {
  allowed: boolean;
  reason?: string;
}

/**
 * Who may set/move a fixture's slot.
 *
 * An organiser (`canManage`) may always override — including when the
 * tournament is in player-arranged ("self") scheduling mode. Participants may
 * arrange their own match. Decided matches and byes are locked.
 */
export function canScheduleFixture(
  m: FixtureLike,
  memberId?: string | null,
  opts: { canManage?: boolean } = {},
): FixtureSchedulePermission {
  if (m.is_bye) return { allowed: false, reason: "This is a bye" };
  if (isMatchTerminal(m)) return { allowed: false, reason: "This match is already decided" };
  if (!m.player_a_member_id || !m.player_b_member_id) {
    return { allowed: false, reason: "Waiting for both players to be known" };
  }
  if (opts.canManage) return { allowed: true };
  if (!isParticipant(m, memberId)) {
    return { allowed: false, reason: "Only the players in this match or an organiser can schedule it" };
  }
  return { allowed: true };
}

/** Clearing a slot follows the same permissions, but only makes sense once set. */
export function canUnscheduleFixture(
  m: FixtureLike,
  memberId?: string | null,
  opts: { canManage?: boolean } = {},
): FixtureSchedulePermission {
  const base = canScheduleFixture(m, memberId, opts);
  if (!base.allowed) return base;
  if (fixtureScheduleState(m) !== "scheduled") {
    return { allowed: false, reason: "This match has no court or time yet" };
  }
  return { allowed: true };
}

/** Row action label — short form is for tight rows / menus. */
export function scheduleActionLabel(m: FixtureLike): string {
  return fixtureScheduleState(m) === "scheduled" ? "Reschedule" : "Set court & time";
}

export function scheduleActionShortLabel(m: FixtureLike): string {
  return fixtureScheduleState(m) === "scheduled" ? "Reschedule" : "Schedule";
}

/** What the date/time columns of a fixture row should read. */
export function fixtureRowSchedule(m: FixtureLike): { date: string | null; time: string | null; isTbd: boolean } {
  if (fixtureScheduleState(m) !== "scheduled") return { date: null, time: null, isTbd: true };
  return {
    date: m.scheduled_date || null,
    time: (m.scheduled_time || "").slice(0, 5) || null,
    isTbd: false,
  };
}

export interface ScheduleResult {
  match_id?: string;
  booking_id?: string | null;
  court_id?: number | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
}

/**
 * Apply the RPC result onto the existing fixture row.
 * The fixture identity (id) is preserved — scheduling never creates a new one.
 */
export function applyScheduleResult<T extends FixtureLike>(m: T, res: ScheduleResult): T {
  return {
    ...m,
    court_id: res.court_id ?? m.court_id ?? null,
    scheduled_date: res.scheduled_date ?? m.scheduled_date ?? null,
    scheduled_time: res.scheduled_time ?? m.scheduled_time ?? null,
    booking_id: res.booking_id ?? m.booking_id ?? null,
  };
}

/** Clearing a slot: keep the fixture, its players and any recorded result. */
export function applyUnscheduleResult<T extends FixtureLike>(m: T): T {
  return { ...m, court_id: null, scheduled_date: null, scheduled_time: null, booking_id: null };
}

/**
 * Client-side conflict pre-check mirroring the server guard.
 * A fixture's own booking is ignored so rescheduling into the same slot works.
 */
export function fixtureSlotConflict(
  m: FixtureLike,
  courtId: number,
  slot: string,
  durationMinutes: number,
  bookings: BookingLike[],
): string | null {
  return isSlotFreeForMatch(slot, durationMinutes, courtId, m, bookings, m.booking_id ?? null)
    ? null
    : "That slot is already booked — please pick another slot";
}

/** Fixtures an organiser still has to place (excludes byes and decided matches). */
export function unscheduledFixtures<T extends FixtureLike>(matches: T[]): T[] {
  return matches.filter(
    (m) => fixtureScheduleState(m) === "unscheduled" && !isMatchTerminal(m),
  );
}
