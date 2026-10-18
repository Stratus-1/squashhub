export type HistoryPeriod = '24-hours' | 'last-day' | 'week' | 'month' | 'last-month' | 'year' | 'last-year' | 'custom';
const DAY = 86400000;
const OFFSET = 7200000;
/** Johannesburg calendar dates, inclusive start and exclusive end. */
export function barHistoryRange(period: HistoryPeriod, now: Date, from?: string, to?: string) {
  if (period === 'custom') {
    if (!from || !to || from > to) return null;
    return { from: new Date(`${from}T00:00:00+02:00`).toISOString(), to: new Date(new Date(`${to}T00:00:00+02:00`).getTime() + DAY).toISOString() };
  }
  if (period === '24-hours' || period === 'week') return { from: new Date(now.getTime() - (period === 'week' ? 7 : 1) * DAY).toISOString(), to: now.toISOString() };
  const sa = new Date(now.getTime() + OFFSET), y = sa.getUTCFullYear(), m = sa.getUTCMonth();
  if (period === 'last-day') {
    const midnight = Date.UTC(y, m, sa.getUTCDate()) - OFFSET;
    return { from: new Date(midnight - DAY).toISOString(), to: new Date(midnight).toISOString() };
  }
  const boundary = (year: number, month: number) => new Date(Date.UTC(year, month, 1) - OFFSET).toISOString();
  if (period === 'last-month') return { from: boundary(y, m - 1), to: boundary(y, m) };
  if (period === 'last-year') return { from: boundary(y - 1, 0), to: boundary(y, 0) };
  return { from: boundary(y, period === 'year' ? 0 : m), to: now.toISOString() };
}
