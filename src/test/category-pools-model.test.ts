import { describe, it, expect } from "vitest";
import { convertGroupsToPools, groupsLookLikePools, poolNamesFor } from "@/lib/smart-builder/category-pools";
import { rowStages, writeRowStages, structureUnits } from "@/lib/smart-builder/structure-rows";
import { buildDrawSpec, type DrawDivision } from "@/lib/smart-builder/step-draw";

const base = (): any => ({ categories: ["Mens A"], subcats: {}, disc: {}, unitEntries: {}, stages: [], formatOverrides: {}, scoringOverrides: {}, playoffOverrides: {}, seedingOverrides: {}, picks: {} });

describe("one category with N pools", () => {
  it("default pool names are Pool A, Pool B, Pool C", () => {
    expect(poolNamesFor({ pools: 3 })).toEqual(["Pool A", "Pool B", "Pool C"]);
  });
  it("keeps edited pool names", () => {
    expect(poolNamesFor({ pools: 2, poolNames: ["North", ""] })).toEqual(["North", "Pool B"]);
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
    expect(st.poolNames).toEqual(["Pool A", "Pool B"]);
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
});
