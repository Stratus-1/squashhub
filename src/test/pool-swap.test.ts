import { describe, it, expect } from "vitest";
import { reorderVisual, poolBlocks } from "@/lib/tournaments/pools";
const ids = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);
describe("cross-pool drag", () => {
  it("swaps across pools, keeping pool sizes and losing nobody", () => {
    const next = reorderVisual(ids, "p1", "p9", 2, { knockout: true });
    expect(new Set(next).size).toBe(12);
    const blocks = poolBlocks(next, 2, { knockout: true, manual: true });
    expect(blocks.map((b) => b.rows.length)).toEqual([8, 4]);
    expect(blocks[1].rows.map((r) => r.item)).toContain("p1");
    expect(blocks[0].rows.map((r) => r.item)).toContain("p9");
  });
  it("still shifts within a pool", () => {
    const next = reorderVisual(ids, "p1", "p4", 2, { knockout: true });
    expect(next.slice(0, 4)).toEqual(["p2", "p3", "p4", "p1"]);
  });
});
