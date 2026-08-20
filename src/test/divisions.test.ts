import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIVISION_SOURCE,
  constrainSeeds,
  describeDivisionSource,
  divisionSource,
  effectivePools,
  mergeLegacySectionsIntoPools,
  parseDivisionSources,
  resolveDivisionCandidates,
  sectionsFromPools,
  validateDivisions,
} from "@/lib/tournaments/divisions";

const names = new Map([
  ["l1", "League 1"],
  ["l2", "League 2"],
  ["l3", "League 3"],
]);

describe("division sources", () => {
  it("defaults to all leagues", () => {
    expect(divisionSource({}, 1)).toEqual(DEFAULT_DIVISION_SOURCE);
    expect(describeDivisionSource(DEFAULT_DIVISION_SOURCE, names)).toBe("All leagues");
  });

  it("parses persisted jsonb pair", () => {
    const parsed = parseDivisionSources({ "1": ["l2", "l3"], "2": [] }, { "1": "combined", "2": "selected" });
    expect(parsed["1"]).toEqual({ mode: "combined", leagueIds: ["l2", "l3"] });
    // empty selection always degrades to "all"
    expect(parsed["2"]).toEqual({ mode: "all", leagueIds: [] });
  });

  it("ignores junk values", () => {
    const parsed = parseDivisionSources({ "1": [1, "l1", null] as any }, { "1": "nonsense" });
    expect(parsed["1"]).toEqual({ mode: "selected", leagueIds: ["l1"] });
  });

  it("describes selected and combined differently", () => {
    expect(describeDivisionSource({ mode: "selected", leagueIds: ["l2", "l3"] }, names)).toBe("League 2 + League 3");
    expect(describeDivisionSource({ mode: "combined", leagueIds: ["l2", "l3"] }, names)).toBe(
      "League 2 + League 3 (combined draw)",
    );
    expect(describeDivisionSource({ mode: "selected", leagueIds: ["l1", "l2", "l3"] }, names)).toBe(
      "League 1 + League 2 +1",
    );
  });
});

describe("candidate resolution", () => {
  const regs = new Map([
    ["l1", ["a", "b"]],
    ["l2", ["c", "b"]],
    ["l3", ["d"]],
  ]);
  const allLeagueIds = ["l1", "l2", "l3"];

  it("all leagues pulls the whole club, de-duplicated", () => {
    expect(resolveDivisionCandidates({ source: DEFAULT_DIVISION_SOURCE, allLeagueIds, registrationsByLeague: regs })).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("selected leagues constrain the population", () => {
    expect(
      resolveDivisionCandidates({
        source: { mode: "selected", leagueIds: ["l2"] },
        allLeagueIds,
        registrationsByLeague: regs,
      }),
    ).toEqual(["c", "b"]);
  });

  it("combined merges the chosen leagues into one population", () => {
    expect(
      resolveDivisionCandidates({
        source: { mode: "combined", leagueIds: ["l2", "l3"] },
        allLeagueIds,
        registrationsByLeague: regs,
      }),
    ).toEqual(["c", "b", "d"]);
  });

  it("constrains ladder seeding to the eligible population", () => {
    const seeds = [{ member_id: "a" }, { member_id: "c" }, { member_id: "z" }];
    expect(constrainSeeds(seeds, ["c", "a"])).toEqual([{ member_id: "a" }, { member_id: "c" }]);
  });
});

describe("pools and legacy sections", () => {
  it("uses the pool count when set", () => {
    expect(effectivePools({ gn: 1, pools: { "1": 4 }, legacySections: { "1": 2 } })).toBe(4);
  });

  it("falls back to legacy sections", () => {
    expect(effectivePools({ gn: 2, pools: {}, legacySections: { "2": 8 } })).toBe(8);
  });

  it("defaults to a single draw", () => {
    expect(effectivePools({ gn: 3, pools: {}, legacySections: {} })).toBe(1);
  });

  it("merges legacy sections into pools on edit without losing pools", () => {
    expect(mergeLegacySectionsIntoPools({ "1": 3 }, { "1": 2, "2": 4 }, 2)).toEqual({ "1": 3, "2": 4 });
  });

  it("writes sections back for knockout divisions only", () => {
    const out = sectionsFromPools({ "1": 4, "2": 2 }, (gn) => gn === 1, 2, { "2": 9 });
    expect(out["1"]).toBe(4);
    expect(out["2"]).toBe(9);
  });
});

describe("validation", () => {
  const pools = { "1": 1, "2": 1 };
  it("warns on multi-league selected divisions", () => {
    const issues = validateDivisions({
      divisionCount: 1,
      sources: { "1": { mode: "selected", leagueIds: ["l2", "l3"] } },
      pools,
      formatFor: () => "knockout",
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].gn).toBe(1);
  });

  it("accepts an explicit combined competition", () => {
    const issues = validateDivisions({
      divisionCount: 1,
      sources: { "1": { mode: "combined", leagueIds: ["l2", "l3"] } },
      pools,
      formatFor: () => "knockout",
    });
    expect(issues).toHaveLength(0);
  });

  it("requires 2+ pools for cross-league play", () => {
    const issues = validateDivisions({ divisionCount: 1, sources: {}, pools, formatFor: () => "cross_league" });
    expect(issues[0].message).toMatch(/2 pools/);
  });

  it("handles multiple divisions with different formats", () => {
    const issues = validateDivisions({
      divisionCount: 2,
      sources: { "2": { mode: "selected", leagueIds: ["l1", "l2"] } },
      pools: { "1": 4, "2": 2 },
      formatFor: (gn) => (gn === 1 ? "knockout" : "single_round_robin"),
    });
    expect(issues).toEqual([{ gn: 2, message: expect.stringContaining("more than one league") }]);
  });
});
