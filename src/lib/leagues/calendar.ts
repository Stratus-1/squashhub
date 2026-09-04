/**
 * Season calendar helpers — public holidays, school-term breaks and week maths.
 *
 * Used by the association season fixture builder so whole weeks (school
 * holidays, shutdowns) can be excluded with one tick while individual public
 * holidays can be excluded date by date.
 */
import { saHolidays, iso, Holiday } from "@/lib/leagues/holidays";

export type DateRange = { start: string; end: string; name: string };

const pad = (n: number) => String(n).padStart(2, "0");
export const parseISODate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * South African school-term breaks (public-school calendar, inland approximation).
 * Ranges are inclusive and cover the non-teaching weeks between terms.
 * Unknown years fall back to the generic seasonal windows below.
 */
const SCHOOL_BREAKS: Record<number, DateRange[]> = {
  2025: [
    { start: "2025-03-29", end: "2025-04-07", name: "Term 1 break" },
    { start: "2025-06-28", end: "2025-07-21", name: "Winter break" },
    { start: "2025-10-04", end: "2025-10-13", name: "Term 3 break" },
    { start: "2025-12-11", end: "2025-12-31", name: "Summer break" },
  ],
  2026: [
    { start: "2026-01-01", end: "2026-01-13", name: "Summer break" },
    { start: "2026-03-21", end: "2026-04-06", name: "Term 1 break" },
    { start: "2026-06-27", end: "2026-07-20", name: "Winter break" },
    { start: "2026-10-03", end: "2026-10-12", name: "Term 3 break" },
    { start: "2026-12-10", end: "2026-12-31", name: "Summer break" },
  ],
  2027: [
    { start: "2027-01-01", end: "2027-01-12", name: "Summer break" },
    { start: "2027-03-27", end: "2027-04-05", name: "Term 1 break" },
    { start: "2027-07-01", end: "2027-07-19", name: "Winter break" },
    { start: "2027-10-02", end: "2027-10-11", name: "Term 3 break" },
    { start: "2027-12-09", end: "2027-12-31", name: "Summer break" },
  ],
};

/** Generic fallback so unlisted years still offer sensible break windows. */
function fallbackBreaks(year: number): DateRange[] {
  return [
    { start: `${year}-03-25`, end: `${year}-04-05`, name: "Term 1 break (estimated)" },
    { start: `${year}-06-28`, end: `${year}-07-19`, name: "Winter break (estimated)" },
    { start: `${year}-10-01`, end: `${year}-10-11`, name: "Term 3 break (estimated)" },
    { start: `${year}-12-10`, end: `${year}-12-31`, name: "Summer break (estimated)" },
  ];
}

export function schoolBreaks(year: number): DateRange[] {
  return SCHOOL_BREAKS[year] ?? fallbackBreaks(year);
}

export function publicHolidays(year: number): Holiday[] {
  return saHolidays(year);
}

/** Every ISO date inside an inclusive range. */
export function expandRange(range: DateRange): string[] {
  const out: string[] = [];
  const cursor = parseISODate(range.start);
  const end = parseISODate(range.end);
  let guard = 0;
  while (cursor <= end && guard++ < 800) {
    out.push(toISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Monday-based week key, e.g. 2026-02-09, for grouping fixtures by week. */
export function weekStart(dateISO: string): string {
  const d = parseISODate(dateISO);
  const dow = d.getDay(); // 0 = Sun
  const delta = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + delta);
  return toISO(d);
}

/** Weeks (Monday keys) covered by a range, useful for "exclude whole week". */
export function weeksInRange(range: DateRange): string[] {
  return Array.from(new Set(expandRange(range).map(weekStart)));
}

export { iso };

export type SeasonWeek = {
  /** Monday key of the week. */
  start: string;
  /** Sunday of the same week. */
  end: string;
  /** ISO dates in this week that are public holidays, with their names. */
  holidays: { date: string; name: string }[];
  /** School-break ranges overlapping this week. */
  breaks: DateRange[];
};

/** Every ISO date in a Monday-start week. */
export function weekDates(mondayISO: string): string[] {
  const out: string[] = [];
  const cursor = parseISODate(mondayISO);
  for (let i = 0; i < 7; i++) {
    out.push(toISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/**
 * Consecutive weeks from the season start date, annotated with the public
 * holidays and school breaks that fall inside them, so an organiser can see at a
 * glance which weeks should be skipped.
 */
export function seasonWeeks(startISO: string, count = 40): SeasonWeek[] {
  const first = weekStart(startISO);
  const years = new Set<number>();
  const cursor = parseISODate(first);
  for (let i = 0; i < count; i++) {
    years.add(cursor.getFullYear());
    cursor.setDate(cursor.getDate() + 7);
  }
  const holidayMap = new Map<string, string>();
  const breaks: DateRange[] = [];
  for (const year of years) {
    for (const holiday of publicHolidays(year)) holidayMap.set(holiday.date, holiday.name);
    breaks.push(...schoolBreaks(year));
  }

  const weeks: SeasonWeek[] = [];
  const walker = parseISODate(first);
  for (let i = 0; i < count; i++) {
    const start = toISO(walker);
    const dates = weekDates(start);
    weeks.push({
      start,
      end: dates[6],
      holidays: dates.filter((d) => holidayMap.has(d)).map((d) => ({ date: d, name: holidayMap.get(d)! })),
      breaks: breaks.filter((range) => range.start <= dates[6] && range.end >= start),
    });
    walker.setDate(walker.getDate() + 7);
  }
  return weeks;
}
