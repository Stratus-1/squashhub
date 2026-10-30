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
  const step = stepMinutes === 60 ? 60 : stepMinutes === 45 ? 45 : stepMinutes === 40 ? 40 : stepMinutes >= 15 ? stepMinutes : 30;
  const defaultStart = step === 40 ? 7 * 60 : 5 * 60;
  const start = openTime ? timeToMinutes(String(openTime)) : defaultStart;
  const last = lastSlotTime ? timeToMinutes(String(lastSlotTime)) : 22 * 60 - step;
  const out: string[] = [];
  for (let m = start; m <= last; m += step) out.push(minutesToTime(m));
  return out;
}

/**
 * Tournament-setup planning pickers (court windows, stage sessions, playoff
 * start) offer at most 30-minute intervals even when the club's booking grid
 * uses hourly slots: these are availability windows, not booking starts.
 */
export function planningSlotStep(clubSlotMinutes: number | null | undefined): number {
  const step = Number(clubSlotMinutes) || 30;
  return Math.min(step, 30);
}

/**
 * Club Champs has its own slots: games book into the match-length grid
 * (e.g. 35 minutes) inside the evening's reserved "Club Championships" holds,
 * not the club's normal booking slots. Contiguous holds per court merge into
 * one span; starts are every `durationMinutes` from the span start, and a
 * start is only offered when the whole match fits inside the span.
 */
export function champsSlotStarts(reservations: BookingLike[], durationMinutes: number): Map<number, string[]> {
  const dur = Math.max(15, durationMinutes);
  const byCourt = new Map<number, { s: number; e: number }[]>();
  for (const b of reservations) {
    if (!isChampsReservation(b) || (b.status || "active") !== "active" || b.court_id == null || !b.start_time) continue;
    // A champs reservation that already carries players' names belongs to a
    // scheduled game — its slot is taken, not part of the free span.
    if (bookingParticipantIds(b).length > 0) continue;
    const s = timeToMinutes(String(b.start_time).slice(0, 5));
    const e = b.end_time ? timeToMinutes(String(b.end_time).slice(0, 5)) : s + dur;
    if (!(e > s)) continue;
    const list = byCourt.get(Number(b.court_id)) ?? [];
    list.push({ s, e });
    byCourt.set(Number(b.court_id), list);
  }
  const out = new Map<number, string[]>();
  for (const [courtId, spans] of byCourt) {
    spans.sort((x, y) => x.s - y.s);
    const merged: { s: number; e: number }[] = [];
    for (const sp of spans) {
      const last = merged[merged.length - 1];
      if (last && sp.s <= last.e) last.e = Math.max(last.e, sp.e);
      else merged.push({ ...sp });
    }
    const times: string[] = [];
    for (const sp of merged) for (let t = sp.s; t + dur <= sp.e; t += dur) times.push(minutesToTime(t));
    out.set(courtId, times);
  }
  return out;
}

export interface BookingLike {
  id?: string;
  court_id?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
  user_id?: string | null;
  opponent_id?: string | null;
  club_member_id?: string | null;
  opponent_member_id?: string | null;
  external_booker_name?: string | null;
}

/**
 * A club's own "Club Championships" court hold (no member attached). Champs
 * players may book their game into it for free; the server releases the hold.
 */
export function isChampsReservation(b: BookingLike): boolean {
  return /^club championship/i.test(String(b.external_booker_name || "").trim())
    && bookingParticipantIds(b).length === 0;
}

export function matchParticipantIds(m: SelfScheduleMatchLike): string[] {
  return [...new Set(
    [
      m.player_a_member_id,
      m.player_b_member_id,
      m.partner_a_member_id,
      m.partner_b_member_id,
    ].filter(Boolean) as string[],
  )];
}

export function bookingParticipantIds(b: BookingLike): string[] {
  return [...new Set(
    [
      b.user_id,
      b.opponent_id,
      b.club_member_id,
      b.opponent_member_id,
    ].filter(Boolean) as string[],
  )];
}

export function bookingConflictsWithParticipants(b: BookingLike, participantIds: string[]): boolean {
  if (participantIds.length === 0) return false;
  const bookingIds = bookingParticipantIds(b);
  return bookingIds.some((id) => participantIds.includes(id));
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
    if (isChampsReservation(b)) return false;
    if (ignoreBookingId && b.id === ignoreBookingId) return false;
    const bs = timeToMinutes(String(b.start_time || "00:00"));
    const be = timeToMinutes(String(b.end_time || "00:00"));
    return bs < end && be > start;
  });
}

/**
 * True when the slot is open on the court and none of the match participants
 * are already booked elsewhere at the same time.
 */
export function isSlotFreeForMatch(
  slot: string,
  durationMinutes: number,
  courtId: number,
  match: SelfScheduleMatchLike,
  bookings: BookingLike[],
  ignoreBookingId?: string | null,
): boolean {
  const start = timeToMinutes(slot);
  const end = start + Math.max(15, durationMinutes);
  const participantIds = matchParticipantIds(match);
  const courtFree = isSlotFree(slot, durationMinutes, courtId, bookings, ignoreBookingId);

  const participantBusy = bookings.some((b) => {
    if ((b.status || "active") !== "active") return false;
    if (ignoreBookingId && b.id === ignoreBookingId) return false;

    const bs = timeToMinutes(String(b.start_time || "00:00"));
    const be = timeToMinutes(String(b.end_time || "00:00"));
    if (!(bs < end && be > start)) return false;

    return bookingConflictsWithParticipants(b, participantIds);
  });

  return courtFree && !participantBusy;
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

/* ── marking ───────────────────────────────────────────────────────────── */

export interface MarkPermission {
  allowed: boolean;
  reason?: string;
}

/**
 * Who may open the game marker for a tournament match.
 *
 * Deliberately independent of scheduling: a self-scheduled match with no
 * court/date/time can still be played and marked (clubs that require a formal
 * booking pass `requireBooking`). Completed / forfeited / walkover matches are
 * NOT freely re-markable — those go through the existing correction flow.
 */
export function canMarkChampMatch(
  m: SelfScheduleMatchLike,
  memberId?: string | null,
  opts: { canManage?: boolean; requireBooking?: boolean; anyClubMember?: boolean } = {},
): MarkPermission {
  if (m.is_bye) return { allowed: false, reason: "This is a bye" };
  const status = String(m.status || "").toLowerCase();
  if (status === "completed" || m.winner_member_id) {
    return { allowed: false, reason: "Result recorded — request a correction to change it" };
  }
  if (["forfeited", "walkover", "cancelled"].includes(status)) {
    return { allowed: false, reason: "This match is already decided" };
  }
  if (!m.player_a_member_id || !m.player_b_member_id) {
    return { allowed: false, reason: "Waiting for both players to be known" };
  }
  // Clubs mark each other's games all the time — a family member or the next
  // pair on court may capture the score. Any club member may mark, unless the
  // caller explicitly restricts it.
  if (!opts.canManage && !opts.anyClubMember && !isParticipant(m, memberId)) {
    return { allowed: false, reason: "Only the players in this match can mark it" };
  }

  if (opts.requireBooking && isUnscheduled(m)) {
    return { allowed: false, reason: "Book a court for this match first" };
  }
  return { allowed: true };
}

/**
 * Scheduled Club Champs games that have no booking row still occupy their
 * court (often on top of a "Club Championships" hold). Turn them into
 * booking-like blockers so pickers never offer those slots. The server guard
 * (no admin bypass) rejects them anyway; this keeps the picker honest.
 */
export function scheduledFixtureBlockers(
  fixtures: Array<SelfScheduleMatchLike & { id: string; court_id?: number | null; scheduled_time?: string | null; booking_id?: string | null; status?: string | null }>,
  durationMinutes: number,
  excludeMatchId?: string | null,
): BookingLike[] {
  const dur = Math.max(15, durationMinutes);
  return fixtures
    .filter((f) => f.id !== excludeMatchId && !f.booking_id && f.court_id != null && f.scheduled_time
      && !["completed", "cancelled", "forfeited", "walkover"].includes(String(f.status || "")))
    .map((f) => {
      const s = timeToMinutes(String(f.scheduled_time).slice(0, 5));
      const ids = matchParticipantIds(f);
      return {
        id: `fixture:${f.id}`,
        court_id: Number(f.court_id),
        start_time: minutesToTime(s),
        end_time: minutesToTime(s + dur),
        status: "active",
        user_id: ids[0] ?? null,
        opponent_id: ids[1] ?? null,
        club_member_id: ids[2] ?? null,
        opponent_member_id: ids[3] ?? null,
        external_booker_name: "Scheduled fixture",
      };
    });
}

/** Read-only board of a court's normal grid slots for one day, so players can see
 *  which slots are free Champs slots, reserved for Champs, already taken, or open
 *  as a normal (paid) club booking. Only `champs-free` slots are bookable here. */
export type DaySlotStatus = "champs-free" | "champs" | "taken" | "open";

export function daySlotBoard(
  slots: string[],
  slotMinutes: number,
  courtId: number,
  bookings: BookingLike[],
  opts: { champsFree?: ReadonlySet<string>; ignoreBookingId?: string | null } = {},
): { time: string; status: DaySlotStatus }[] {
  const champsFree = opts.champsFree ?? new Set<string>();
  return slots.map((time) => {
    if (champsFree.has(time)) return { time, status: "champs-free" };
    const start = timeToMinutes(time);
    const end = start + slotMinutes;
    const overlapsHold = bookings.some(
      (b) =>
        b.court_id === courtId &&
        (b.status || "active") === "active" &&
        isChampsReservation(b) &&
        timeToMinutes(String(b.start_time || "00:00")) < end &&
        timeToMinutes(String(b.end_time || "00:00")) > start,
    );
    if (overlapsHold) return { time, status: "champs" };
    return {
      time,
      status: isSlotFree(time, slotMinutes, courtId, bookings, opts.ignoreBookingId)
        ? "open"
        : "taken",
    };
  });
}
