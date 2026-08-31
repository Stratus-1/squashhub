/**
 * Tracks door-open activity so the LiveSessionBanner's "Open Door" prompt can
 * suppress itself when the member has already unlocked the door (from either
 * the banner itself or the Access group in DashboardDeviceControls).
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

/* ------------------------------------------------------------------ *
 * Auto-unlock on arrival
 * The door fires once when the member walks into the geofence. It only
 * re-arms after they leave the fence again (or after a cooldown), so
 * standing at the club doesn't pulse the relay over and over.
 * ------------------------------------------------------------------ */

const AUTO_KEY = (clubId: string) => `door_auto_unlock_${clubId}`;

/** Auto-unlock already fired for the current visit? */
export function autoUnlockFired(clubId: string, cooldownMs: number): boolean {
  try {
    const raw = localStorage.getItem(AUTO_KEY(clubId));
    if (!raw) return false;
    return Date.now() - Number(raw) < cooldownMs;
  } catch {
    return false;
  }
}

export function markAutoUnlockFired(clubId: string) {
  try {
    localStorage.setItem(AUTO_KEY(clubId), String(Date.now()));
  } catch {
    // ignore
  }
}

/** Called once the member has clearly left the fence — allows a new auto open. */
/** Timestamp (ms) of the last auto-unlock, or null. */
export function autoUnlockLastFiredAt(clubId: string): number | null {
  try {
    const raw = localStorage.getItem(AUTO_KEY(clubId));
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export function rearmAutoUnlock(clubId: string) {
  try {
    localStorage.removeItem(AUTO_KEY(clubId));
  } catch {
    // ignore
  }
}

