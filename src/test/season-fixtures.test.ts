import { describe, expect, it } from "vitest";
import { generateSeasonFixtures, type DivisionPlan } from "@/lib/leagues/season-fixtures";
import { expandRange, schoolBreaks, weekStart } from "@/lib/leagues/calendar";

const team = (n: number, club: string) => ({
  team_id: `t${n}`,
  team_name: `${club} ${n}`,
  team_code: `C${n}`,
  club_id: `club-${club}`,
  club_name: club,
});

const division = (name: string, clubs: string[], playDows: number[]): DivisionPlan => ({
  division: name,
  teams: clubs.map((club, index) => team(index + 1, club)),
  playDows,
});

describe("season fixture generation", () => {
  it("plays every team against every other twice with reversed venues", () => {
    const plan = generateSeasonFixtures({
      divisions: [division("Men's 1", ["Alpha", "Bravo", "Charlie", "Delta"], [3])],
      startDate: "2026-03-04",
      exclusions: {},
      twoLegs: true,
    });

    expect(plan.fixtures).toHaveLength(12);
    const legOne = plan.fixtures.filter((f) => f.leg === 1);
    const legTwo = plan.fixtures.filter((f) => f.leg === 2);
    expect(legOne).toHaveLength(6);
    expect(legTwo).toHaveLength(6);

    const reversed = new Set(legTwo.map((f) => `${f.home_team_id}|${f.away_team_id}`));
    for (const fixture of legOne) {
      expect(reversed.has(`${fixture.away_team_id}|${fixture.home_team_id}`)).toBe(true);
    }
    for (const fixture of plan.fixtures) {
      expect(fixture.venue_name).toBe(fixture.home_team_name.split(" ")[0]);
    }
  });

  it("keeps each division on its own play night", () => {
    const plan = generateSeasonFixtures({
      divisions: [
        division("Men's 1", ["Alpha", "Bravo"], [2]),
        division("Ladies 1", ["Echo", "Foxtrot"], [4]),
      ],
      startDate: "2026-03-02",
      exclusions: {},
      twoLegs: false,
    });

    const dow = (iso: string) => new Date(`${iso}T00:00:00`).getDay();
    for (const fixture of plan.fixtures) {
      expect(dow(fixture.fixture_date)).toBe(fixture.division === "Men's 1" ? 2 : 4);
    }
  });

  it("skips excluded dates, reports the reason and still schedules every round", () => {
    const plan = generateSeasonFixtures({
      divisions: [division("Men's 1", ["Alpha", "Bravo", "Charlie", "Delta"], [3])],
      startDate: "2026-03-04",
      exclusions: { "2026-03-11": "Public holiday" },
      twoLegs: false,
    });

    expect(plan.fixtures.some((f) => f.fixture_date === "2026-03-11")).toBe(false);
    expect(plan.skipped).toContainEqual({ division: "Men's 1", date: "2026-03-11", reason: "Public holiday" });
    expect(new Set(plan.fixtures.map((f) => f.fixture_date)).size).toBe(3);
  });

  it("delays the return leg until the requested mid-season restart", () => {
    const plan = generateSeasonFixtures({
      divisions: [division("Men's 1", ["Alpha", "Bravo"], [3])],
      startDate: "2026-03-04",
      exclusions: {},
      twoLegs: true,
      secondLegStart: "2026-07-01",
    });

    const legTwo = plan.fixtures.filter((f) => f.leg === 2);
    expect(legTwo).toHaveLength(1);
    expect(legTwo[0].fixture_date >= "2026-07-01").toBe(true);
  });

  it("flags a division that cannot produce fixtures", () => {
    const plan = generateSeasonFixtures({
      divisions: [division("Men's 4", ["Alpha"], [3])],
      startDate: "2026-03-04",
      exclusions: {},
      twoLegs: true,
    });

    expect(plan.fixtures).toHaveLength(0);
    expect(plan.conflicts.some((c) => c.kind === "too-few-teams")).toBe(true);
  });

  it("never books a team twice in the same week", () => {
    const plan = generateSeasonFixtures({
      divisions: [division("Men's 1", ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"], [3])],
      startDate: "2026-03-04",
      exclusions: {},
      twoLegs: true,
    });

    expect(plan.conflicts.filter((c) => c.kind === "team-double-booked")).toHaveLength(0);
    const seen = new Set<string>();
    for (const fixture of plan.fixtures) {
      for (const id of [fixture.home_team_id, fixture.away_team_id]) {
        const key = `${weekStart(fixture.fixture_date)}|${id}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it("expands a school break into every excluded date", () => {
    const winter = schoolBreaks(2026).find((r) => r.name === "Winter break")!;
    const dates = expandRange(winter);
    expect(dates[0]).toBe(winter.start);
    expect(dates[dates.length - 1]).toBe(winter.end);

    const plan = generateSeasonFixtures({
      divisions: [division("Men's 1", ["Alpha", "Bravo", "Charlie", "Delta"], [3])],
      startDate: "2026-06-24",
      exclusions: Object.fromEntries(dates.map((d) => [d, winter.name])),
      twoLegs: false,
    });
    for (const fixture of plan.fixtures) {
      expect(dates).not.toContain(fixture.fixture_date);
    }
  });
});
