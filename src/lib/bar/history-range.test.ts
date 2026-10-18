import { describe, expect, it } from 'vitest';
import { barHistoryRange } from './history-range';
describe('closed tab date periods', () => {
  const now = new Date('2026-10-17T23:03:00Z');
  it('last 24 hours', () => expect(barHistoryRange('24-hours', now)).toEqual({ from: '2026-10-16T23:03:00.000Z', to: now.toISOString() }));
  it('last day is yesterday in Johannesburg, not a rolling 24 hours', () => expect(barHistoryRange('last-day', now)).toEqual({ from: '2026-10-16T22:00:00.000Z', to: '2026-10-17T22:00:00.000Z' }));
  it('last week is the preceding seven days', () => expect(barHistoryRange('week', now)?.from).toBe('2026-10-10T23:03:00.000Z'));
  it('month so far starts at Johannesburg midnight', () => expect(barHistoryRange('month', now)).toEqual({ from: '2026-09-30T22:00:00.000Z', to: now.toISOString() }));
  it('last month is the full calendar month', () => expect(barHistoryRange('last-month', now)).toEqual({ from: '2026-08-31T22:00:00.000Z', to: '2026-09-30T22:00:00.000Z' }));
  it('year to date', () => expect(barHistoryRange('year', now)).toEqual({ from: '2025-12-31T22:00:00.000Z', to: now.toISOString() }));
  it('last year is the full calendar year', () => expect(barHistoryRange('last-year', now)).toEqual({ from: '2024-12-31T22:00:00.000Z', to: '2025-12-31T22:00:00.000Z' }));
  it('custom includes the whole end date', () => expect(barHistoryRange('custom', now, '2026-10-01', '2026-10-18')).toEqual({ from: '2026-09-30T22:00:00.000Z', to: '2026-10-18T22:00:00.000Z' }));
  it('rejects reversed or incomplete dates', () => { expect(barHistoryRange('custom', now, '2026-10-18', '2026-10-01')).toBeNull(); expect(barHistoryRange('custom', now)).toBeNull(); });
  it('handles Johannesburg New Year rollover', () => expect(barHistoryRange('last-month', new Date('2026-12-31T23:03:00Z'))).toEqual({ from: '2026-11-30T22:00:00.000Z', to: '2026-12-31T22:00:00.000Z' }));
});
