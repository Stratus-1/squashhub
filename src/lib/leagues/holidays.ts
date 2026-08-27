/**
 * South African public holidays, computed locally (no external API).
 *
 * Fixed-date holidays plus the two Easter-based ones (Good Friday, Family Day).
 * Per the Public Holidays Act, a holiday falling on a Sunday is observed on the
 * following Monday — both dates are returned so a league night on either is
 * flagged.
 */
export type Holiday = { date: string; name: string };

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Anonymous Gregorian computus. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const FIXED: [number, number, string][] = [
  [1, 1, "New Year's Day"],
  [3, 21, "Human Rights Day"],
  [4, 27, "Freedom Day"],
  [5, 1, "Workers' Day"],
  [6, 16, "Youth Day"],
  [8, 9, "National Women's Day"],
  [9, 24, "Heritage Day"],
  [12, 16, "Day of Reconciliation"],
  [12, 25, "Christmas Day"],
  [12, 26, "Day of Goodwill"],
];

export function saHolidays(year: number): Holiday[] {
  const out: Holiday[] = [];
  const push = (d: Date, name: string) => {
    out.push({ date: iso(d), name });
    if (d.getDay() === 0) {
      const mon = new Date(d);
      mon.setDate(mon.getDate() + 1);
      out.push({ date: iso(mon), name: `${name} (observed)` });
    }
  };
  for (const [m, day, name] of FIXED) push(new Date(year, m - 1, day), name);
  const easter = easterSunday(year);
  const good = new Date(easter);
  good.setDate(good.getDate() - 2);
  out.push({ date: iso(good), name: "Good Friday" });
  const family = new Date(easter);
  family.setDate(family.getDate() + 1);
  out.push({ date: iso(family), name: "Family Day" });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
