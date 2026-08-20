import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIVISION_SOURCE,
  constrainIds,
  constrainSeeds,
  divisionEligibleIds,
  findIneligibleAssignments,
  formatUsesPools,
  poolLabel,
  poolOptions,
  isEligibleForDivision,
  planAllLeaguesExpansion,
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

describe("eligibility invariant", () => {
  const ctx = {
    sources: {
      "1": { mode: "selected" as const, leagueIds: ["l1"] },
      "2": { mode: "combined" as const, leagueIds: ["l2", "l3"] },
      "3": { mode: "all" as const, leagueIds: [] },
    },
    allLeagueIds: ["l1", "l2", "l3"],
    registrationsByLeague: new Map([
      ["l1", ["a", "b"]],
      ["l2", ["c"]],
      ["l3", ["d"]],
    ]),
  };

  it("constrains auto seeding to the source league", () => {
    expect(constrainIds(["a", "c", "z"], divisionEligibleIds(1, ctx))).toEqual(["a"]);
  });

  it("combined divisions accept every listed source league", () => {
    expect(constrainIds(["c", "d", "a"], divisionEligibleIds(2, ctx))).toEqual(["c", "d"]);
  });

  it("all-leagues divisions never restrict", () => {
    expect(isEligibleForDivision("z", 3, ctx)).toBe(true);
    expect(isEligibleForDivision("z", 1, ctx)).toBe(false);
  });

  it("flags a manually added ineligible player after the roster changes", () => {
    const assignments = new Map([
      ["a", 1],
      ["c", 1], // manually dragged in from another league
      ["d", 2],
      ["z", 3], // guest in an all-leagues division
    ]);
    expect(findIneligibleAssignments(assignments, ctx)).toEqual([{ memberId: "c", gn: 1 }]);
  });

  it("honours an explicit admin override instead of dropping the entry", () => {
    const withOverride = { ...ctx, overrides: new Set(["c"]) };
    expect(findIneligibleAssignments(new Map([["c", 1]]), withOverride)).toEqual([]);
    expect(constrainIds(["c"], divisionEligibleIds(1, ctx), withOverride.overrides)).toEqual(["c"]);
  });
});

describe("all-leagues expansion", () => {
  const leagues = [
    { id: "l1", name: "League 1" },
    { id: "l2", name: "League 2" },
    { id: "l3", name: "League 3" },
  ];

  it("creates one division per source league, reusing the all-leagues template", () => {
    const plan = planAllLeaguesExpansion({ templateGn: 1, divisionCount: 1, sources: {}, leagues });
    expect(plan.divisionCount).toBe(3);
    expect(plan.created.map((c) => [c.gn, c.leagueId])).toEqual([
      [1, "l1"],
      [2, "l2"],
      [3, "l3"],
    ]);
    expect(plan.created.every((c) => c.templateGn === 1)).toBe(true);
  });

  it("is idempotent — repeated runs create nothing new", () => {
    const sources = {
      "1": { mode: "selected" as const, leagueIds: ["l1"] },
      "2": { mode: "selected" as const, leagueIds: ["l2"] },
      "3": { mode: "selected" as const, leagueIds: ["l3"] },
    };
    const plan = planAllLeaguesExpansion({ templateGn: 1, divisionCount: 3, sources, leagues });
    expect(plan.created).toHaveLength(0);
    expect(plan.skipped).toHaveLength(3);
    expect(plan.divisionCount).toBe(3);
  });

  it("preserves manual divisions and only adds the missing leagues", () => {
    const sources = {
      "1": { mode: "selected" as const, leagueIds: ["l2"] }, // manual division
      "2": { mode: "all" as const, leagueIds: [] }, // template
    };
    const plan = planAllLeaguesExpansion({ templateGn: 2, divisionCount: 2, sources, leagues });
    expect(plan.skipped).toEqual([{ leagueId: "l2", gn: 1 }]);
    expect(plan.created.map((c) => [c.gn, c.leagueId])).toEqual([
      [2, "l1"],
      [3, "l3"],
    ]);
    expect(plan.divisionCount).toBe(3);
  });

  it("leaves an explicit combined competition alone", () => {
    const sources = { "1": { mode: "combined" as const, leagueIds: ["l1", "l2"] } };
    const plan = planAllLeaguesExpansion({ templateGn: 1, divisionCount: 1, sources, leagues });
    // a combined draw does not "own" its leagues, so each still gets its own
    // division, and the combined division itself is untouched
    expect(plan.created.map((c) => c.gn)).toEqual([2, 3, 4]);
    expect(divisionSource(sources, 1).mode).toBe("combined");
  });

  it("generated divisions can be edited independently", () => {
    const plan = planAllLeaguesExpansion({ templateGn: 1, divisionCount: 1, sources: {}, leagues });
    const sources: Record<string, any> = {};
    plan.created.forEach((c) => (sources[String(c.gn)] = { mode: "selected", leagueIds: [c.leagueId] }));
    // editing division 2 does not touch division 3
    sources["2"] = { mode: "combined", leagueIds: ["l2", "l3"] };
    expect(divisionSource(sources, 3)).toEqual({ mode: "selected", leagueIds: ["l3"] });
  });
});

describe("single pool selector", () => {
  it("only offers a pool selector for formats that use pools", () => {
    expect(formatUsesPools("knockout")).toBe(true);
    expect(formatUsesPools("single_round_robin")).toBe(true);
    expect(formatUsesPools("swiss")).toBe(true);
    expect(formatUsesPools("cross_league")).toBe(true);
    expect(formatUsesPools("groups_playoffs" as any)).toBe(false);
    expect(formatUsesPools(null)).toBe(false);
  });

  it("labels 1 as a draw and 2+ as pools", () => {
    expect(poolLabel(1)).toBe("1 draw");
    expect(poolLabel(2)).toBe("2 pools");
    expect(poolLabel(8)).toBe("8 pools");
  });

  it("always includes the current value in the options", () => {
    expect(poolOptions(1)).toEqual([1, 2, 4, 8]);
    expect(poolOptions(3)).toEqual([1, 2, 3, 4, 8]);
    expect(poolOptions(0)).toEqual([1, 2, 4, 8]);
  });

  it("header summary and selector read the same value (no drift)", () => {
    const pools = { "1": 4 };
    const legacySections = { "1": 2 };
    const value = effectivePools({ gn: 1, pools, legacySections });
    expect(value).toBe(4);
    expect(poolLabel(value)).toBe("4 pools");
  });

  it("falls back to the legacy section count for older tournaments", () => {
    expect(effectivePools({ gn: 1, pools: {}, legacySections: { "1": 2 } })).toBe(2);
  });

  it("persists the chosen pool count through save/reload", () => {
    const pools = { "1": 4 };
    const saved = sectionsFromPools(pools, () => true, 1, {});
    // reload: pool map wins, legacy map matches it
    expect(saved["1"]).toBe(4);
    expect(effectivePools({ gn: 1, pools: mergeLegacySectionsIntoPools({}, saved, 1), legacySections: saved })).toBe(4);
  });
});
