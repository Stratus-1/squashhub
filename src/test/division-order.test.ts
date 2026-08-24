import { describe, it, expect } from "vitest";
import { applyDivisionOrder } from "@/lib/tournaments/seeding";
import { flattenPools, reorderVisual } from "@/lib/tournaments/pools";

describe("applyDivisionOrder", () => {
  it("keeps every entrant when the global order is missing some of them", () => {
    const all = ["a", "b", "c", "d"];
    const out = applyDivisionOrder(["a", "b"], all, ["c", "a"]);
    expect(new Set(out)).toEqual(new Set(all));
    expect(out.length).toBe(4);
    expect(out.filter((x) => x === "a").length).toBe(1);
  });

  it("drops stale ids and duplicates", () => {
    const out = applyDivisionOrder(["zz", "a", "a", "b"], ["a", "b"], ["b", "a"]);
    expect(out).toEqual(["b", "a"]);
  });

  it("preserves non-division entrants in place", () => {
    const out = applyDivisionOrder(["a", "x", "b"], ["a", "b", "x"], ["b", "a"]);
    expect(out).toEqual(["b", "x", "a"]);
  });

  it("cross-pool drag keeps both pool sizes and loses nobody", () => {
    const ids = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const visual = flattenPools(ids, 2);
    const moved = reorderVisual(visual, visual[0], visual[4], 2);
    const next = applyDivisionOrder([], ids, moved);
    expect(new Set(next)).toEqual(new Set(ids));
    expect(next.length).toBe(6);
  });
});
