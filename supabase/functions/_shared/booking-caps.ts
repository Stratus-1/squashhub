// Pure booking-cap check used before a booking is sent to an external
// provider (GoBook). Mirrors the club's SquashHub rules: daily total and
// peak-hour maximum per member, with permission-based bypasses.

export type PeakClub = {
  peak_weekday_start?: string | null; peak_weekday_end?: string | null;
  peak_weekend_start?: string | null; peak_weekend_end?: string | null;
  peak_day_overrides?: Record<string, { off?: boolean; start?: string; end?: string }> | null;
  max_bookings_per_day?: number | null; max_peak_bookings_per_day?: number | null;
};
export type CapBooking = { start_time: string; end_time: string };

const t = (v: string) => { const [h, m] = v.split(":").map(Number); return h * 60 + (m || 0); };

export function peakWindow(club: PeakClub, date: string): [number, number] | null {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const o = club.peak_day_overrides?.[String(dow)];
  if (o && typeof o === "object") {
    if (o.off) return null;
    if (o.start && o.end) return [t(o.start), t(o.end)];
  }
  return dow === 0 || dow === 6
    ? [t(club.peak_weekend_start || "08:00"), t(club.peak_weekend_end || "12:00")]
    : [t(club.peak_weekday_start || "16:00"), t(club.peak_weekday_end || "19:00")];
}

export function checkBookingCaps(opts: {
  club: PeakClub; date: string; start: string; end: string; existing: CapBooking[];
  unlimited: boolean; unlimitedNonPeak: boolean;
}): string | null {
  const win = peakWindow(opts.club, opts.date);
  const inPeak = (s: string, e: string) => !!win && t(s) < win[1] && t(e) > win[0];
  const newPeak = inPeak(opts.start, opts.end);
  if (opts.unlimited || (!newPeak && opts.unlimitedNonPeak)) return null;
  const maxDaily = Math.max(1, opts.club.max_bookings_per_day ?? 4);
  if (opts.existing.length >= maxDaily) return `Daily booking limit reached (max ${maxDaily} per day)`;
  if (newPeak) {
    const maxPeak = Math.max(1, opts.club.max_peak_bookings_per_day ?? 1);
    if (opts.existing.filter((b) => inPeak(b.start_time, b.end_time)).length >= maxPeak) {
      return `Peak-hour booking limit reached (max ${maxPeak} per day)`;
    }
  }
  return null;
}
