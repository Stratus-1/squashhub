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
    expect(cal.querySelector('[data-timing="play_by"]')).toBeTruthy();
    expect(cal.textContent).toContain("Saved fixture");
    fireEvent.click(screen.getByLabelText("My matches"));
    expect(screen.getByTestId("club-fixtures-count").textContent).toBe("1 of 4 fixtures");
    expect(screen.queryByRole("button", { name: /save|reschedule|score/i })).toBeNull();
  });
});
