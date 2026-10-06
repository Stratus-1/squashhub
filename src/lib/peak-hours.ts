/**
 * Peak-hour windows per club. Mirrors public.club_peak_window() in the database
 * (which enforces the peak cap server-side) — keep both in sync.
 *
 * clubs.peak_day_overrides is keyed by JS day number "0" (Sun) … "6" (Sat):
 *   { start: "HH:MM", end: "HH:MM" }  → custom window for that day
 *   { off: true }                     → no peak time that day
 * A missing day falls back to the weekday / weekend default.
 */
export type PeakOverride = { start?: string; end?: string; off?: boolean };
export type PeakOverrides = Record<string, PeakOverride>;

export const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Display order Mon → Sun. */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const toMin = (t: string) => {
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
export const toHHMM = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function defaultPeakWindow(club: any, day: number): { start: string; end: string } {
  const weekend = day === 0 || day === 6;
  return weekend
    ? { start: String(club?.peak_weekend_start ?? "08:00").slice(0, 5), end: String(club?.peak_weekend_end ?? "12:00").slice(0, 5) }
    : { start: String(club?.peak_weekday_start ?? "16:00").slice(0, 5), end: String(club?.peak_weekday_end ?? "19:00").slice(0, 5) };
}

/** Effective peak window for a weekday, or null when that day has no peak time. */
export function peakWindowForDay(club: any, day: number): { start: string; end: string } | null {
  if (!club) return null;
  const o = (club.peak_day_overrides || {})[String(day)] as PeakOverride | undefined;
  if (o && typeof o === "object") {
    if (o.off) return null;
    if (o.start && o.end) return { start: o.start.slice(0, 5), end: o.end.slice(0, 5) };
  }
  return defaultPeakWindow(club, day);
}

export function isPeakSlot(date: Date, startTime: string, club: any): boolean {
  const w = peakWindowForDay(club, date.getDay());
  if (!w) return false;
  const m = toMin(startTime);
  return m >= toMin(w.start) && m < toMin(w.end);
}

/** Slot start times for the club's court grid (same rule as the bookings page). */
export function clubSlotStarts(slotMinutes: number, openTime?: string | null, lastSlotTime?: string | null): string[] {
  const step = [30, 40, 45, 60].includes(slotMinutes) ? slotMinutes : 30;
  const start = openTime ? toMin(openTime) : step === 40 ? 7 * 60 : 5 * 60;
  const last = lastSlotTime ? toMin(lastSlotTime) : 22 * 60 - step;
  const out: string[] = [];
  for (let m = start; m <= last; m += step) out.push(toHHMM(m));
  return out;
}
