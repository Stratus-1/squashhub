import type { CalEvent } from "@/components/tournaments/FixtureCalendar";

export type CategoryCalendarFixture = Omit<CalEvent, "date"> & { date: string | null; group: number | null; category: string };

/** Select a visual emphasis, never filter or allocate the tournament's saved games. */
export function categoryCalendar(fixtures: CategoryCalendarFixture[], group: number) {
  const events: CalEvent[] = [];
  const unscheduled: CategoryCalendarFixture[] = [];
  for (const fixture of fixtures) {
    if (!fixture.date) { unscheduled.push(fixture); continue; }
    events.push({ ...fixture, date: fixture.date, highlighted: fixture.group === group });
  }
  return { events, unscheduled };
}