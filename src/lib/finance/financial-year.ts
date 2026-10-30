/**
 * Financial-year period helpers. `endMonth` is the club's saved
 * financial_year_end_month (1–12, default 2 = February).
 * Dates are plain yyyy-MM-dd strings in club-local terms.
 */
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

export function financialYearStart(endMonth: number, today: Date = new Date()): { year: number; month: number } {
  const em = Math.min(12, Math.max(1, Math.round(endMonth || 2)));
  const startMonth = (em % 12) + 1;
  const m = today.getMonth() + 1;
  const year = m >= startMonth ? today.getFullYear() : today.getFullYear() - 1;
  return { year, month: startMonth };
}

/** Current financial year: first day of the year up to today. */
export function thisFinancialYear(endMonth: number, today: Date = new Date()) {
  const s = financialYearStart(endMonth, today);
  return { from: ymd(s.year, s.month, 1), to: ymd(today.getFullYear(), today.getMonth() + 1, today.getDate()) };
}

/** Previous complete financial year, e.g. 1 Mar 2025 – 28 Feb 2026. */
export function previousFinancialYear(endMonth: number, today: Date = new Date()) {
  const s = financialYearStart(endMonth, today);
  const endM = s.month === 1 ? 12 : s.month - 1;
  const endY = s.month === 1 ? s.year - 1 : s.year;
  return { from: ymd(s.year - 1, s.month, 1), to: ymd(endY, endM, lastDay(endY, endM)) };
}
