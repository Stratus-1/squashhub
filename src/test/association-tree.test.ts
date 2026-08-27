import { describe, expect, it } from "vitest";
import {
  AssocTeam,
  buildAssocTree,
  clubsWithoutTeams,
  filterAssocTree,
  levelLabel,
  seasonsOf,
  summarize,
} from "@/lib/leagues/association-tree";
import { easterSunday, saHolidays } from "@/lib/leagues/holidays";
import { generateTwoLegFixtures, playDates, roundRobin } from "@/lib/leagues/two-leg-fixtures";

const team = (o: Partial<AssocTeam> & { team_id: string; team_name: string; club_name: string }): AssocTeam => ({
  team_code: null,
  level: null,
  is_reserve: false,
  category: null,
  season_year: 2026,
  club_id: o.club_name,
  created_by_association: false,
  player_count: 4,
  ...o,
} as AssocTeam);

const teams: AssocTeam[] = [
  team({ team_id: "a", team_name: "Uitsig 1", club_name: "Uitsig", level: 1 }),
  team({ team_id: "b", team_name: "Adelaar 1", club_name: "Adelaar", level: 1 }),
  team({ team_id: "r", team_name: "1st L Reserves", club_name: "Uitsig", level: 1, is_reserve: true }),
  team({ team_id: "c", team_name: "CSIR 2", club_name: "CSIR", level: 2 }),
  team({ team_id: "x", team_name: "Wanderers", club_name: "CSIR" }),
];

describe("association league tree", () => {
  it("groups by league level with unplaceable teams last", () => {
    const tree = buildAssocTree(teams, "level");
    expect(tree.map((n) => n.label)).toEqual(["1st League", "2nd League", "Needs league assignment"]);
    expect(tree[0].teamCount).toBe(3);
    expect(tree[0].playerCount).toBe(12);
    // reserves sort last within the level
    expect(tree[0].teams[2].team_id).toBe("r");
  });

  it("groups by club alphabetically", () => {
    const tree = buildAssocTree(teams, "club");
    expect(tree.map((n) => n.label)).toEqual(["Adelaar", "CSIR", "Uitsig"]);
    expect(tree[1].teamCount).toBe(2);
  });

  it("searches club, team and code", () => {
    const tree = buildAssocTree(teams, "level");
    expect(filterAssocTree(tree, "adelaar")[0].teams.map((t) => t.team_id)).toEqual(["b"]);
    expect(filterAssocTree(tree, "2nd")).toHaveLength(1);
    expect(filterAssocTree(tree, "zzz")).toHaveLength(0);
  });

  it("lists seasons and clubs with nothing submitted", () => {
    expect(seasonsOf(teams)).toEqual([2026]);
    const missing = clubsWithoutTeams(
      [{ id: "Uitsig", name: "Uitsig" }, { id: "Irene", name: "Irene" }],
      teams
    );
    expect(missing.map((c) => c.name)).toEqual(["Irene"]);
  });

  it("summarises the selection", () => {
    expect(summarize(teams)).toBe("3 clubs · 5 teams · 20 players");
    expect(levelLabel(null)).toBe("Needs league assignment");
  });
});

describe("two-leg fixtures", () => {
  it("pairs every team once per leg", () => {
    const rounds = roundRobin(["a", "b", "c", "d"]);
    expect(rounds).toHaveLength(3);
    expect(rounds.every((r) => r.length === 2)).toBe(true);
  });

  it("handles an odd number of teams with byes", () => {
    const rounds = roundRobin(["a", "b", "c"]);
    expect(rounds).toHaveLength(3);
    expect(rounds.flat().filter(([h, a]) => h === null || a === null)).toHaveLength(3);
  });

  it("skips holidays and keeps weekly cadence", () => {
    const dates = playDates("2026-01-01", [3], ["2026-01-07"], 3);
    expect(dates).toEqual(["2026-01-14", "2026-01-21", "2026-01-28"]);
  });

  it("generates a home leg and a return leg with venues swapped", () => {
    const t = (id: string, club: string) => ({
      team_id: id,
      team_name: `${club} 1`,
      team_code: id.toUpperCase(),
      club_id: club,
      club_name: club,
    });
    const fx = generateTwoLegFixtures({
      teams: [t("a", "Uitsig"), t("b", "Adelaar")],
      division: "1st League",
      startDate: "2026-01-07",
      playDows: [3],
      skipDates: [],
    });
    expect(fx).toHaveLength(2);
    expect(fx[0].leg).toBe(1);
    expect(fx[1].leg).toBe(2);
    expect(fx[1].home_team_id).toBe(fx[0].away_team_id);
    expect(fx[1].venue_name).toBe(fx[1].home_team_name.split(" ")[0]);
  });

  it("returns nothing for a single team", () => {
    expect(generateTwoLegFixtures({ teams: [], division: "x", startDate: "2026-01-07", playDows: [3], skipDates: [] })).toEqual([]);
  });
});

describe("SA holidays", () => {
  it("computes Easter and the Easter-based holidays", () => {
    expect(easterSunday(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    const list = saHolidays(2026).map((h) => h.date);
    expect(list).toContain("2026-04-03"); // Good Friday
    expect(list).toContain("2026-04-06"); // Family Day
    expect(list).toContain("2026-12-16");
  });

  it("adds the Monday observance when a holiday falls on a Sunday", () => {
    const list = saHolidays(2027);
    // 2027-03-21 is a Sunday → observed on the 22nd
    expect(list.some((h) => h.date === "2027-03-22" && h.name.includes("observed"))).toBe(true);
  });
});
