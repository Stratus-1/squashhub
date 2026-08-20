import { describe, expect, it } from "vitest";
import {
  isSeasonFallback,
  needsLevelConfirmation,
  ordinalFromName,
  pickSeasonForYear,
  resolveLeagueSeasonLevels,
  seasonsPresent,
} from "@/lib/leagues/season-level";
import { buildLeagueTree, filterTreeBySeason, seasonsInTree } from "@/lib/tournaments/league-tree";

const ASSOC = "assoc-1";

const row = (o: Partial<any> & { id: string; name: string }) => ({
  association_id: ASSOC,
  code: null,
  season_year: null,
  level: null,
  is_reserve: null,
  ...o,
});

describe("season + level resolution", () => {
  it("reads names as labels only", () => {
    expect(ordinalFromName("First League")).toBe(1);
    expect(ordinalFromName("3rd L Reserves")).toBe(3);
    expect(ordinalFromName("Boomslangs")).toBeNull();
  });

  it("prefers stored level and season over inference", () => {
    const res = resolveLeagueSeasonLevels(
      [row({ id: "t1", name: "Boomslangs", level: 3, season_year: 2026, is_reserve: false })],
      { fixtureEvidence: new Map([["t1", { level: 1, seasonYear: 2025 }]]) },
    );
    expect(res.get("t1")).toMatchObject({ level: 3, seasonYear: 2026, levelSource: "stored" });
  });

  it("falls back to fixture evidence when nothing is stored", () => {
    const res = resolveLeagueSeasonLevels([row({ id: "t1", name: "Cobras" })], {
      fixtureEvidence: new Map([["t1", { level: 3, seasonYear: 2026 }]]),
    });
    expect(res.get("t1")).toMatchObject({ level: 3, seasonYear: 2026, levelSource: "fixtures" });
  });

  it("resolves reserves from their own name and inherits the sole season", () => {
    const res = resolveLeagueSeasonLevels(
      [
        row({ id: "t1", name: "Cobras", code: "NIL019" }),
        row({ id: "r3", name: "3rd L Reserves", code: "NIL028" }),
      ],
      { fixtureEvidence: new Map([["t1", { level: 3, seasonYear: 2026 }]]) },
    );
    expect(res.get("r3")).toMatchObject({ level: 3, isReserve: true, seasonYear: 2026 });
  });

  it("leaves genuinely ambiguous rows unresolved for admin confirmation", () => {
    const res = resolveLeagueSeasonLevels([row({ id: "x", name: "Mystery Team" })]);
    expect(res.get("x")!.level).toBeNull();
    expect(needsLevelConfirmation(res)).toEqual(["x"]);
  });

  it("lists seasons newest first", () => {
    const res = resolveLeagueSeasonLevels([
      row({ id: "a", name: "A", level: 1, season_year: 2026 }),
      row({ id: "b", name: "B", level: 1, season_year: 2027 }),
    ]);
    expect(seasonsPresent(res)).toEqual([2027, 2026]);
  });
});

describe("season selection for a tournament", () => {
  it("uses the tournament's own year when that structure exists", () => {
    expect(pickSeasonForYear([2027, 2026], 2026)).toBe(2026);
    expect(isSeasonFallback([2027, 2026], 2026)).toBe(false);
  });

  it("falls back to the latest earlier season and flags it", () => {
    expect(pickSeasonForYear([2026], 2027)).toBe(2026);
    expect(isSeasonFallback([2026], 2027)).toBe(true);
  });

  it("never invents a season for a club with none", () => {
    expect(pickSeasonForYear([], 2027)).toBeNull();
  });
});

describe("season-aware league tree", () => {
  const leagues2026 = [
    { id: "26a", name: "Boomslangs", association_id: ASSOC, assocName: "NIL", level: 1, seasonYear: 2026 },
    { id: "26b", name: "Canopy Kings", association_id: ASSOC, assocName: "NIL", level: 1, seasonYear: 2026 },
    { id: "26r", name: "1st L Reserves", association_id: ASSOC, assocName: "NIL", level: 1, seasonYear: 2026, isReserve: true },
  ];
  const leagues2027 = [
    { id: "27a", name: "New Team A", association_id: ASSOC, assocName: "NIL", level: 1, seasonYear: 2027 },
    { id: "27b", name: "New Team B", association_id: ASSOC, assocName: "NIL", level: 1, seasonYear: 2027 },
  ];

  it("keeps the same level in two years as distinct groups", () => {
    const tree = buildLeagueTree([...leagues2026, ...leagues2027]);
    const level1 = tree.filter((g) => g.tierNumber === 1);
    expect(level1).toHaveLength(2);
    expect(level1.map((g) => g.seasonYear)).toEqual([2027, 2026]);
  });

  it("groups teams and reserves under their own season's level", () => {
    const tree = buildLeagueTree([...leagues2026, ...leagues2027]);
    const g26 = tree.find((g) => g.seasonYear === 2026)!;
    expect(g26.children.map((c) => c.id).sort()).toEqual(["26a", "26b", "26r"]);
    expect(g26.children.find((c) => c.id === "26r")!.isReserve).toBe(true);
  });

  it("2026 grouping is unchanged after 2027 leagues appear", () => {
    const before = buildLeagueTree(leagues2026);
    const after = filterTreeBySeason(buildLeagueTree([...leagues2026, ...leagues2027]), 2026);
    expect(after.map((g) => g.children.map((c) => c.id))).toEqual(
      before.map((g) => g.children.map((c) => c.id)),
    );
  });

  it("never leaks players across years when filtering by season", () => {
    const tree = filterTreeBySeason(buildLeagueTree([...leagues2026, ...leagues2027]), 2027);
    const ids = tree.flatMap((g) => g.children.map((c) => c.id));
    expect(ids.sort()).toEqual(["27a", "27b"]);
  });

  it("attaches an un-fixtured reserves row to its own season only", () => {
    const tree = buildLeagueTree([
      ...leagues2026,
      { id: "27r", name: "1st L Reserves", association_id: ASSOC, assocName: "NIL", seasonYear: 2027 },
    ]);
    const g27 = tree.find((g) => g.seasonYear === 2027)!;
    expect(g27.children.map((c) => c.id)).toEqual(["27r"]);
    expect(tree.find((g) => g.seasonYear === 2026)!.children).toHaveLength(3);
  });

  it("reports the seasons available in the tree", () => {
    expect(seasonsInTree(buildLeagueTree([...leagues2026, ...leagues2027]))).toEqual([2027, 2026]);
  });

  it("behaves exactly as before for clubs with no season data", () => {
    const tier = new Map([["a", "1st League"]]);
    const tree = buildLeagueTree(
      [
        { id: "a", name: "Team A", association_id: ASSOC, assocName: "NIL" },
        { id: "r", name: "1st L Reserves", association_id: ASSOC, assocName: "NIL" },
      ],
      tier,
    );
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((c) => c.id).sort()).toEqual(["a", "r"]);
    expect(filterTreeBySeason(tree, 2026)).toHaveLength(1);
  });
});
