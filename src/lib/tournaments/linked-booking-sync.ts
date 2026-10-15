/**
 * How a tournament match's displayed schedule follows its LINKED court booking.
 * Mirrors the backend trigger `sync_champ_match_from_linked_booking` so the
 * Super Admin snapshot preview can simulate it without writing anything.
 *
 * Rules: only an explicit booking_id link counts (never same player/date);
 * book/reschedule copies date/time/court; cancel/delete clears them and the
 * match reverts to its Play-by deadline, which is always retained. Decided
 * matches, pairings and results are never touched.
 */
export interface SyncMatch {
  id: string; status: string | null; is_bye?: boolean | null;
  scheduled_date: string | null; scheduled_time: string | null; court_id: number | null;
  booking_id: string | null; play_by: string | null;
}
export type BookingEvent =
  | { kind: "link"; bookingId: string; date: string; time: string; courtId: number }
  | { kind: "reschedule"; bookingId: string; date: string; time: string; courtId: number }
  | { kind: "cancel"; bookingId: string };

const decided = (m: SyncMatch) => !!m.is_bye || ["completed", "forfeited", "walkover", "cancelled"].includes(String(m.status));

export function applyBookingEvent<M extends SyncMatch>(m: M, e: BookingEvent): M {
  if (decided(m)) return { ...m };
  if (e.kind === "link") {
    if (m.booking_id && m.booking_id !== e.bookingId) return { ...m }; // already linked elsewhere
    return { ...m, booking_id: e.bookingId, scheduled_date: e.date, scheduled_time: e.time, court_id: e.courtId };
  }
  if (m.booking_id !== e.bookingId) return { ...m }; // unrelated booking
  if (e.kind === "reschedule") return { ...m, scheduled_date: e.date, scheduled_time: e.time, court_id: e.courtId };
  return { ...m, booking_id: null, scheduled_date: null, scheduled_time: null, court_id: null };
}

/** Display line: booked slot plus retained deadline, or deadline only. */
export function linkedScheduleLabel(m: SyncMatch, courtName?: string | null): string {
  const pb = m.play_by ? `Play by ${m.play_by.slice(0, 10)}` : null;
  if (m.booking_id && m.scheduled_date) {
    const slot = `Booked ${m.scheduled_date}${m.scheduled_time ? ` ${m.scheduled_time.slice(0, 5)}` : ""}${courtName ? ` · ${courtName}` : ""}`;
    return pb ? `${slot} · ${pb}` : slot;
  }
  return pb ?? "Not scheduled";
}
