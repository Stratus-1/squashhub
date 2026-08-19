import { describe, it, expect } from "vitest";
import {
  isActionableTournamentMatch,
  isActionableLeagueFixture,
  isTerminalMatchStatus,
} from "@/lib/tournaments/actionable-match";

const TODAY = "2026-08-20";
const o = { today: TODAY };

const pastChamp = { id: "p", status: "completed", start_date: "2026-07-24", end_date: "2026-07-26" };
const staleChamp = { id: "s", status: "planning", start_date: "2026-07-01", end_date: "2026-07-05" };
const liveChamp = { id: "l", status: "in_progress", start_date: "2026-08-18", end_date: "2026-08-25" };

describe("actionable tournament matches", () => {
  it("rejects a pending child of a completed tournament (Nelspruit Masters Doubles case)", () => {
    expect(
      isActionableTournamentMatch({ status: "scheduled", scheduled_date: "2026-07-25" }, pastChamp, o),
    ).toBe(false);
  });

  it("rejects a pending child of a tournament whose dates have passed", () => {
    expect(
      isActionableTournamentMatch({ status: "scheduled", scheduled_date: "2026-08-21" }, staleChamp, o),
    ).toBe(false);
  });

  it("rejects a past-dated match even inside a current tournament", () => {
    expect(
      isActionableTournamentMatch({ status: "scheduled", scheduled_date: "2026-08-19" }, liveChamp, o),
    ).toBe(false);
  });

  it.each(["completed", "cancelled", "forfeit", "walkover", "no_show", "withdrawn", "void", "bye"])(
    "rejects terminal child status %s",
    (status) => {
      expect(isTerminalMatchStatus(status)).toBe(true);
      expect(isActionableTournamentMatch({ status, scheduled_date: "2026-08-21" }, liveChamp, o)).toBe(false);
    },
  );

  it("hides null-date matches by default and shows them only for admin unscheduled surfaces", () => {
    const m = { status: "scheduled", scheduled_date: null };
    expect(isActionableTournamentMatch(m, liveChamp, o)).toBe(false);
    expect(isActionableTournamentMatch(m, liveChamp, { ...o, includeUnscheduled: true })).toBe(true);
  });

  it("accepts today's and upcoming matches in a running tournament", () => {
    expect(isActionableTournamentMatch({ status: "scheduled", scheduled_date: TODAY }, liveChamp, o)).toBe(true);
    expect(
      isActionableTournamentMatch({ status: "in_progress", scheduled_date: "2026-08-22" }, liveChamp, o),
    ).toBe(true);
  });

  it("refuses when the parent tournament is unknown", () => {
    expect(isActionableTournamentMatch({ status: "scheduled", scheduled_date: TODAY }, null, o)).toBe(false);
  });
});

describe("actionable league fixtures", () => {
  it("rejects past fixtures", () => {
    expect(isActionableLeagueFixture({ status: null, fixture_date: "2026-07-25" }, o)).toBe(false);
  });
  it("rejects terminal fixtures", () => {
    expect(isActionableLeagueFixture({ status: "completed", fixture_date: "2026-08-22" }, o)).toBe(false);
    expect(isActionableLeagueFixture({ status: "cancelled", fixture_date: "2026-08-22" }, o)).toBe(false);
  });
  it("accepts an undecided upcoming fixture", () => {
    expect(isActionableLeagueFixture({ status: null, fixture_date: "2026-08-22" }, o)).toBe(true);
    expect(isActionableLeagueFixture({ status: "scheduled", fixture_date: TODAY }, o)).toBe(true);
  });
  it("hides undated fixtures", () => {
    expect(isActionableLeagueFixture({ status: "scheduled", fixture_date: null }, o)).toBe(false);
  });
});
