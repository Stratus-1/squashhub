import { describe, it, expect } from "vitest";
import { convertGroupsToPools, groupsLookLikePools, poolNamesFor, poolPlayerSplit, poolSummary, renamePool } from "@/lib/smart-builder/category-pools";
import { answersFromOriginalStructure, originalStructureFromAnswers } from "@/lib/smart-builder/original-structure";
import { rowStages, writeRowStages, structureUnits } from "@/lib/smart-builder/structure-rows";
import { buildDrawSpec, type DrawDivision } from "@/lib/smart-builder/step-draw";

const base = (): any => ({ categories: ["Mens A"], subcats: {}, disc: {}, unitEntries: {}, stages: [], formatOverrides: {}, scoringOverrides: {}, playoffOverrides: {}, seedingOverrides: {}, picks: {} });

describe("one category with N pools", () => {
  it("new pools default to Pool 1, Pool 2, Pool 3", () => {
    expect(poolNamesFor({ pools: 3 })).toEqual(["Pool 1", "Pool 2", "Pool 3"]);
  });
  it("keeps edited pool names", () => {
    expect(poolNamesFor({ pools: 2, poolNames: ["North", ""] })).toEqual(["North", "Pool 2"]);
  });
  it("two round-robin subdivisions convert into ONE category with 2 pools, not Men's A1/A2", () => {
    let a = base();
    a.subcats = { "Mens A": ["1", "2"] };
    a.unitEntries = { "Mens A::1": "4", "Mens A::2": "4" };
    a = writeRowStages(a, "Mens A::1", [{ id: "s1", kind: "round_robin", pools: 1 } as any]);
    a = writeRowStages(a, "Mens A::2", [{ id: "s2", kind: "round_robin", pools: 1 } as any]);
    expect(groupsLookLikePools(a, "Mens A")).toBe(true);
    const out = convertGroupsToPools(a, "Mens A");
    expect(structureUnits(out)).toEqual(["Mens A"]);
    const st = rowStages(out, "Mens A")[0];
    expect(st.kind).toBe("pools");
    expect(st.pools).toBe(2);
    expect(st.poolNames).toEqual(["Pool 1", "Pool 2"]);
    expect(out.unitEntries["Mens A"]).toBe("8");
  });
  it("draw spec makes one division with named pools", () => {
    const units = Array.from({ length: 8 }, (_, i) => ({ member: `m${i}` })) as any;
    const d: DrawDivision = { group: 1, label: "Mens A · Singles", doubles: false, units, format: { kind: "pools", pools: 2, seeding: "snake", schedule: { rule: "fixed", deadlines: [], dates: [] } } as any, notes: [], playoffs: [], poolNames: ["North", "South"] };
    const spec = buildDrawSpec("T", [d], "v1");
    expect(spec.divisions).toHaveLength(1);
    expect((spec.divisions[0] as any).poolLabels).toEqual(["North", "South"]);
    expect(spec.divisions[0].stages[0].pools).toBe(2);
  });
  it("existing saved names (e.g. Pool A / Pool B) are kept", () => {
    expect(poolNamesFor({ pools: 2, poolNames: ["Pool A", "Pool B"] })).toEqual(["Pool A", "Pool B"]);
  });
  it("8 players in 2 pools are 4 and 4; summary reads '2 pools · 8 players'", () => {
    expect(poolPlayerSplit(8, 2)).toEqual([4, 4]);
    expect(poolPlayerSplit(9, 2)).toEqual([5, 4]);
    expect(poolSummary(8, 2)).toBe("2 pools · 8 players");
  });
  it("renaming a pool changes only that label", () => {
    expect(renamePool(undefined, 2, 1, "South")).toEqual(["Pool 1", "South"]);
  });
  it("structure screen round-trip keeps ONE category with 2 named pools", () => {
    let a = base();
    a.unitEntries = { "Mens A": "8" };
    a = writeRowStages(a, "Mens A", [{ id: "s1", kind: "pools", pools: 2 } as any]);
    const raw = originalStructureFromAnswers(a);
    expect(raw.num_groups).toBe(1);
    expect(raw.league_pool_names["1"]).toEqual(["Pool 1", "Pool 2"]);
    const back = answersFromOriginalStructure(a, { ...raw, league_pool_names: { "1": ["North", "South"] } });
    expect(structureUnits(back)).toEqual(["Mens A"]);
    expect(rowStages(back, "Mens A")[0].pools).toBe(2);
    expect(rowStages(back, "Mens A")[0].poolNames).toEqual(["North", "South"]);
  });
  it("legacy numbered pool slots inherit the first pool's settings (no repeated setup)", () => {
    let a = base();
    a.subcats = { "Mens A": ["1", "2"] };
    a.unitEntries = { "Mens A::1": "4", "Mens A::2": "4" };
    a = writeRowStages(a, "Mens A::1", [{ id: "s1", kind: "round_robin", pools: 1 } as any]);
    a = writeRowStages(a, "Mens A::2", [{ id: "s2", kind: "round_robin", pools: 1 } as any]);
    const raw = originalStructureFromAnswers(a);
    expect(raw._pool_groups).toHaveLength(1);
    const back = answersFromOriginalStructure(a, { ...raw, league_best_of: { "1": 3, "2": 5 } });
    expect(back.scoringOverrides["Mens A::2"].bestOf).toBe(3);
  });
});
