/**
 * Self-scheduled tournament matches.
 *
 * When a tournament runs in "players arrange their own court/date/time" mode
 * the draw is created UNSCHEDULED: the match knows who plays whom, in which
 * division/section and by when, but has no court, date or time. The two
 * participants (or an organiser) then book a real court slot themselves.
 *
 * This module holds the pure logic so it can be tested without the database.
 */

export interface SelfScheduleMatchLike {
  id?: string;
  status?: string | null;
  is_bye?: boolean | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  court_id?: number | null;
  play_by?: string | null;
  player_a_member_id?: string | null;
  player_b_member_id?: string | null;
  partner_a_member_id?: string | null;
  partner_b_member_id?: string | null;
  winner_member_id?: string | null;
}

/** Statuses after which a match can never be (re)scheduled. */
export const TERMINAL_MATCH_STATUSES = ["completed", "forfeited", "walkover", "cancelled"];

export function isMatchTerminal(m: SelfScheduleMatchLike): boolean {
  if (m.is_bye) return true;
  if (m.winner_member_id) return true;
  return TERMINAL_MATCH_STATUSES.includes(String(m.status || "").toLowerCase());
}

/** A match that exists but has no court/date/time yet. */
export function isUnscheduled(m: SelfScheduleMatchLike): boolean {
  return !m.scheduled_date || !m.scheduled_time || !m.court_id;
}

export function isParticipant(m: SelfScheduleMatchLike, memberId?: string | null): boolean {
  if (!memberId) return false;
  return [m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id]
    .filter(Boolean)
    .includes(memberId);
}

export interface SchedulePermission {
  allowed: boolean;
  reason?: string;
}

/**
 * Who may pick a court/time for this match: either of the two sides, or an
 * organiser/club admin. Nobody else — and nobody at all once the match is
 * decided or superseded by progression.
 */
export function canSelfScheduleMatch(
  m: SelfScheduleMatchLike,
  memberId?: string | null,
  opts: { canManage?: boolean } = {},
): SchedulePermission {
  if (isMatchTerminal(m)) return { allowed: false, reason: "This match is already decided" };
  if (!m.player_a_member_id || !m.player_b_member_id) {
    return { allowed: false, reason: "Waiting for both players to be known" };
  }
  if (opts.canManage) return { allowed: true };
  if (!isParticipant(m, memberId)) {
    return { allowed: false, reason: "Only the players in this match can schedule it" };
  }
  return { allowed: true };
}

/* ── slot helpers ──────────────────────────────────────────────────────── */

export function timeToMinutes(t: string): number {
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Club booking grid, mirroring the court-booking page's window rules. */
export function buildSlots(stepMinutes: number, openTime?: string | null, lastSlotTime?: string | null): string[] {
  const step = stepMinutes === 60 ? 60 : stepMinutes === 40 ? 40 : 30;
  const defaultStart = step === 40 ? 7 * 60 : 5 * 60;
  const start = openTime ? timeToMinutes(String(openTime)) : defaultStart;
  const last = lastSlotTime ? timeToMinutes(String(lastSlotTime)) : 22 * 60 - step;
  const out: string[] = [];
  for (let m = start; m <= last; m += step) out.push(minutesToTime(m));
  return out;
}

export interface BookingLike {
  id?: string;
  court_id?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
}

/**
 * True when [slot, slot+duration) does not overlap any active booking on the
 * court. `ignoreBookingId` lets a match keep its own slot while rescheduling.
 */
export function isSlotFree(
  slot: string,
  durationMinutes: number,
  courtId: number,
  bookings: BookingLike[],
  ignoreBookingId?: string | null,
): boolean {
  const start = timeToMinutes(slot);
  const end = start + Math.max(15, durationMinutes);
  return !bookings.some((b) => {
    if (b.court_id !== courtId) return false;
    if ((b.status || "active") !== "active") return false;
    if (ignoreBookingId && b.id === ignoreBookingId) return false;
    const bs = timeToMinutes(String(b.start_time || "00:00"));
    const be = timeToMinutes(String(b.end_time || "00:00"));
    return bs < end && be > start;
  });
}

export function freeSlotsForCourt(
  slots: string[],
  durationMinutes: number,
  courtId: number,
  bookings: BookingLike[],
  ignoreBookingId?: string | null,
): string[] {
  return slots.filter((s) => isSlotFree(s, durationMinutes, courtId, bookings, ignoreBookingId));
}

/** Player-facing headline for an unscheduled knockout match. */
export function unscheduledMatchLabel(m: SelfScheduleMatchLike): string {
  return m.play_by
    ? `Not yet scheduled — play by ${m.play_by}`
    : "Not yet scheduled";
}
