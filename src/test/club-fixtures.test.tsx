import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { filterFixtures, fixtureState, gameScoreLine, groupByDay, timingOf, type ClubFixture } from "@/lib/tournaments/club-fixtures";
import { ClubFixturesPilot } from "@/components/tournaments/ClubFixturesPilot";

const fx = (o: Partial<ClubFixture>): ClubFixture => ({ id: Math.random().toString(), source: "tournament", competitionId: "t1", competition: "Champs", category: "Mens A", round: 1, a: "Ann", b: "Bea", date: null, time: null, court: null, playBy: null, timing: "unscheduled", state: "upcoming", score: null, liveGames: null, mine: false, ...o });
const list = [
  fx({ id: "1", date: "2026-11-04", time: "18:00:00", court: "Court 1", timing: "saved", mine: true }),
  fx({ id: "2", date: "2026-11-04", time: "18:30:00", court: "Court 2", timing: "saved", state: "live", score: "1-0", liveGames: "11-7, 5-3", category: "Mens B" }),
  fx({ id: "3", playBy: "2026-11-25", timing: "play_by", competitionId: "t2", competition: "League" }),
  fx({ id: "4", state: "completed", score: "3-1" }),
];

describe("club fixtures pilot", () => {
  it("states and timing come from saved data only", () => {
    expect(fixtureState({ status: "completed" }, false, false)).toBe("completed");
    expect(fixtureState({ status: "in_progress" }, true, false)).toBe("live");
    expect(fixtureState({ status: "in_progress" }, false, true)).toBe("paused");
    expect(fixtureState({ is_bye: true }, false, false)).toBe("bye");
    expect(timingOf({ scheduled_date: "2026-11-04" })).toBe("saved");
    expect(timingOf({ play_by: "2026-11-25" })).toBe("play_by");
    expect(timingOf({})).toBe("unscheduled");
    expect(gameScoreLine([[11, 7], [5, 3]])).toBe("11-7, 5-3");
  });
  it("filters by competition, category, court, date and mine", () => {
    expect(filterFixtures(list, { competition: "t2" }).map((x) => x.id)).toEqual(["3"]);
    expect(filterFixtures(list, { category: "Mens B" }).map((x) => x.id)).toEqual(["2"]);
    expect(filterFixtures(list, { court: "Court 1" }).map((x) => x.id)).toEqual(["1"]);
    expect(filterFixtures(list, { date: "2026-11-25" }).map((x) => x.id)).toEqual(["3"]);
    expect(filterFixtures(list, { mine: true }).map((x) => x.id)).toEqual(["1"]);
  });
  it("calendar groups saved by date, play-by on deadline, unscheduled last", () => {
    expect(groupByDay(list).map((d) => d.day)).toEqual(["2026-11-04", "2026-11-25", "Not scheduled"]);
  });
  it("renders list with LIVE score, switches to calendar, read-only", () => {
    render(<ClubFixturesPilot fixtures={list} canMine />);
    expect(screen.getByTestId("club-fixtures-list").textContent).toContain("LIVE");
    expect(screen.getByTestId("club-fixtures-list").textContent).toContain("11-7, 5-3");
    fireEvent.click(screen.getByRole("tab", { name: "Calendar View" }));
    const cal = screen.getByTestId("club-fixtures-calendar");
    expect(cal.querySelector('[data-testid="fixture-calendar"]')).toBeTruthy();
    expect(cal.textContent).toContain("Saved fixture");
    fireEvent.click(screen.getByLabelText("My matches"));
    expect(screen.getByTestId("club-fixtures-count").textContent).toBe("1 of 4 fixtures");
    expect(screen.queryByRole("button", { name: /save|reschedule|score/i })).toBeNull();
  });
});

import { FixtureCalendar, hourRange, initialCalendarDate } from "@/components/tournaments/FixtureCalendar";
describe("visual fixture calendar", () => {
  const evs = [
    { id: "a", date: "2026-10-14", time: "17:40", court: "Court 1", title: "A v B", kind: "confirmed" as const },
    { id: "b", date: "2026-10-14", time: "18:20", court: "Court 3", title: "C v D", kind: "confirmed" as const },
    { id: "c", date: "2026-11-11", time: "18:00", court: "Court 2", title: "Position 1 v Position 12 (TBD)", kind: "proposed" as const },
  ];
  it("week grid by date/time; day view keeps time slots with court labels", () => {
    expect(initialCalendarDate(evs, "2026-10-01")).toBe("2026-10-14");
    expect(hourRange(evs)).toEqual([16, 20]);
    render(<FixtureCalendar events={evs} />);
    expect(screen.getAllByTestId("cal-day")).toHaveLength(7);
    expect(screen.getAllByTestId("cal-event")).toHaveLength(2);
    fireEvent.click(screen.getByRole("tab", { name: "day" }));
    expect(screen.getAllByTestId("cal-day")).toHaveLength(1);
    expect(screen.getAllByTestId("cal-event").map((e) => e.textContent)).toEqual([expect.stringContaining("Court 1"), expect.stringContaining("Court 3")]);
  });
  it("next navigates; proposed blocks are visually distinct", () => {
    render(<FixtureCalendar events={evs} />);
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByTestId("cal-event").getAttribute("data-kind")).toBe("proposed");
  });
});

describe("calendar zoom + details", () => {
  const evs = [{ id: "a", date: "2026-10-14", time: "17:40", court: "Court 1", title: "A v B", kind: "confirmed" as const }];
  it("zoom buttons change visual scale only; tap opens read-only details", () => {
    render(<FixtureCalendar events={evs} />);
    const h0 = screen.getByTestId("cal-grid").style.height;
    fireEvent.click(screen.getByLabelText("Zoom in calendar"));
    expect(screen.getByTestId("cal-zoom").textContent).toBe("125%");
    expect(screen.getByTestId("cal-grid").style.height).not.toBe(h0);
    fireEvent.click(screen.getByLabelText("Reset calendar zoom"));
    expect(screen.getByTestId("cal-zoom").textContent).toBe("100%");
    fireEvent.click(screen.getByTestId("cal-event"));
    expect(screen.getByTestId("cal-detail").textContent).toContain("17:40");
    expect(screen.getByTestId("cal-detail").textContent).toContain("Court 1");
  });
});
