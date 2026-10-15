import { describe, expect, it } from "vitest";
import { rrEdges, rrIssues, rrMatchCount, rrSizes, rrSlotPairs } from "../rr-topology";
import { courtLoad, stageMatches, unitCapacity } from "../structure-capacity";

describe("planning round-robin group topology", () => {
  it("single group defaults to within with no self-match", () => {
    expect(rrEdges(1)).toEqual([[0, 0]]);
    expect(rrMatchCount([5])).toBe(10);
    expect(rrSlotPairs([5]).every(([a, b]) => a !== b)).toBe(true);
  });
  it("unequal odd pools count within only", () => {
    expect(rrSizes(9, 2)).toEqual([5, 4]);
    expect(rrMatchCount([5, 4])).toBe(16);
    expect(rrSlotPairs([5, 4]).every(([a, b]) => a.split(":")[0] === b.split(":")[0])).toBe(true);
  });
  it("between selected pools has no own-pool games and deduplicates reciprocals", () => {
    const t = { mode: "between" as const, edges: [[0, 1], [1, 0], [0, 1]] as [number, number][] };
    expect(rrMatchCount([3, 5], t)).toBe(15);
    const pairs = rrSlotPairs([3, 5], t);
    expect(pairs).toHaveLength(15);
    expect(new Set(pairs.map((p) => [...p].sort().join("/"))).size).toBe(15);
    expect(pairs.every(([a, b]) => a.split(":")[0] !== b.split(":")[0])).toBe(true);
  });
  it("custom combines selected within and between edges exactly once", () => {
    const t = { mode: "custom" as const, edges: [[0, 0], [0, 1], [1, 0], [1, 2], [2, 2]] as [number, number][] };
    expect(rrMatchCount([3, 4, 5], t)).toBe(3 + 12 + 20 + 10);
    expect(rrSlotPairs([3, 4, 5], t)).toHaveLength(45);
    expect(rrSlotPairs([3, 4, 5], t).every(([a, b]) => a !== b)).toBe(true);
  });
  it("flags missing groups, stale edges and incompatible counts rather than silently pruning saved choices", () => {
    expect(rrIssues(9, 2, { mode: "within", sizes: [3, 5] })).not.toEqual([]);
    expect(rrIssues(9, 2, { mode: "between", edges: [[0, 2]] })).not.toEqual([]);
    expect(rrIssues(12, 3, { mode: "custom", edges: [[0, 1]] })).not.toEqual([]);
    expect(rrIssues(9, 2, { mode: "between", edges: [[0, 0], [0, 1]] })).not.toEqual([]);
  });
  it("capacity uses explicit unequal sizes and the same selected topology", () => {
    const stage = { id: "rr", kind: "round_robin" as const, pools: 3, rrTopology: { mode: "between" as const, sizes: [3, 5, 1], edges: [[0, 1], [1, 2]] as [number, number][] } };
    expect(stageMatches(stage, 9)).toBe(20);
    expect(unitCapacity({ stagePlans: { Ladies: [stage] } }, "Ladies", 9).matches).toBe(20);
    expect(courtLoad(20, 45).needHours).toBe(15);
    expect(stageMatches(stage, 10)).toBeNull();
  });
  it("every valid topology count equals its unique slot pairs across odd and unequal fields", () => {
    for (const sizes of [[2, 3], [3, 4, 5], [1, 3, 5]]) for (const mode of ["within", "between", "custom"] as const) {
      const edges = sizes.flatMap((_, a) => sizes.flatMap((__, b) => a <= b && (mode === "custom" || a !== b) ? [[a, b] as [number, number]] : []));
      const t = { mode, edges }, pairs = rrSlotPairs(sizes, t);
      expect(rrMatchCount(sizes, t)).toBe(pairs.length);
      expect(new Set(pairs.map((p) => [...p].sort().join("/"))).size).toBe(pairs.length);
    }
  });
});