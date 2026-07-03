/**
 * Tracks door-open activity so the LiveSessionBanner's "Open Door" prompt can
 * suppress itself when the member has already unlocked the door (from either
 * the banner itself or the always-visible DashboardOpenDoorCard).
 *
 * Two signals are stored in localStorage:
 *  - `door_opened_booking_<bookingId>` — set when the door is opened while a
 *    specific booking is active/upcoming. Used to hide the door prompt for
 *    that booking window entirely.
 *  - `door_opened_last_ts` — timestamp of the most recent door open, used to
 *    suppress the prompt for early arrivals (no matching booking yet).
 */

const BOOKING_KEY = (bookingId: string) => `door_opened_booking_${bookingId}`;
const LAST_TS_KEY = "door_opened_last_ts";

export function markDoorOpened(bookingId?: string | null) {
  try {
    localStorage.setItem(LAST_TS_KEY, String(Date.now()));
    if (bookingId) localStorage.setItem(BOOKING_KEY(bookingId), String(Date.now()));
  } catch {
    // ignore
  }
}

export function wasDoorOpenedForBooking(bookingId?: string | null): boolean {
  if (!bookingId) return false;
  try {
    return !!localStorage.getItem(BOOKING_KEY(bookingId));
  } catch {
    return false;
  }
}

/** Was the door opened in the last `withinMs` milliseconds? */
export function wasDoorOpenedRecently(withinMs: number): boolean {
  try {
    const raw = localStorage.getItem(LAST_TS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < withinMs;
  } catch {
    return false;
  }
}
