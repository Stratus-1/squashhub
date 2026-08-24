import { describe, expect, it } from "vitest";
import {
  balancedSectionSizes,
  byesFor,
  describeSectionSizes,
  knockoutSectionSizes,
  totalByes,
} from "@/lib/tournaments/knockout-sections";
import { poolCounts, poolSizes, distributeIntoPools, poolBlocks } from "@/lib/tournaments/pools";

describe("knockout section sizing", () => {
  it("prefers powers of two over equal headcount", () => {
    expect(knockoutSectionSizes(14, 2)).toEqual([8, 6]);
    expect(knockoutSectionSizes(22, 3)).toEqual([8, 8, 6]);
    expect(knockoutSectionSizes(30, 4)).toEqual([8, 8, 8, 6]);
    expect(knockoutSectionSizes(12, 2)).toEqual([8, 4]);
  });

  it("keeps exact powers of two intact", () => {
    expect(knockoutSectionSizes(16, 2)).toEqual([8, 8]);
    expect(knockoutSectionSizes(32, 4)).toEqual([8, 8, 8, 8]);
    expect(knockoutSectionSizes(64, 2)).toEqual([32, 32]);
    expect(knockoutSectionSizes(8, 2)).toEqual([4, 4]);
  });

  it("never produces fewer byes than the balanced split", () => {
    for (let total = 4; total <= 40; total++) {
      for (const sections of [2, 3, 4, 8]) {
        const ko = knockoutSectionSizes(total, sections);
        expect(ko.reduce((a, b) => a + b, 0)).toBe(total);
        expect(totalByes(ko)).toBeLessThanOrEqual(totalByes(balancedSectionSizes(total, sections)));
      }
    }
  });

  it("handles small and degenerate counts", () => {
    expect(knockoutSectionSizes(3, 2)).toEqual([1, 2]); // degenerate: balanced fallback
    expect(knockoutSectionSizes(5, 2)).toEqual([3, 2]);
    expect(knockoutSectionSizes(7, 2)).toEqual([4, 3]);
    expect(knockoutSectionSizes(6, 2)).toEqual([4, 2]);
    expect(knockoutSectionSizes(9, 1)).toEqual([9]);
    expect(knockoutSectionSizes(0, 3)).toEqual([0, 0, 0]);
    expect(knockoutSectionSizes(2, 4).reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("reports bracket byes", () => {
    expect(byesFor(8)).toBe(0);
    expect(byesFor(6)).toBe(2);
    expect(byesFor(1)).toBe(0);
    expect(describeSectionSizes([8, 6])).toBe("8 + 6");
  });
});

describe("pool distribution respects knockout capacities", () => {
  const seeds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

  it("splits knockout divisions equally, just like every other format", () => {
    expect(poolSizes(14, 2, { knockout: true })).toEqual([7, 7]);
    expect(poolSizes(14, 2)).toEqual([7, 7]);
    expect(poolSizes(11, 2, { knockout: true })).toEqual([5, 6]);
    expect(poolCounts(22, 3, { knockout: true })).toEqual([8, 7, 7]);
  });

  it("leaves every non-knockout format untouched", () => {
    expect(distributeIntoPools(seeds(8), 2)).toEqual([
      [1, 4, 5, 8],
      [2, 3, 6, 7],
    ]);
    expect(poolCounts(9, 2)).toEqual([5, 4]);
    expect(poolCounts(5, 4)).toEqual([1, 1, 1, 2]);
  });

  it("keeps top seeds apart and fills to the target capacity", () => {
    const pools = distributeIntoPools(seeds(14), 2, { knockout: true });
    expect(pools.map((p) => p.length)).toEqual([7, 7]);
    expect(pools[0][0]).toBe(1);
    expect(pools[1][0]).toBe(2);
    expect([...pools[0], ...pools[1]].sort((a, b) => a - b)).toEqual(seeds(14));
  });

  it("shows the chosen sizes as separate blocks", () => {
    const blocks = poolBlocks(seeds(14), 2, { knockout: true });
    expect(blocks.map((b) => `${b.letter} (${b.rows.length})`)).toEqual(["A (7)", "B (7)"]);
  });

  it("preserves a manual arrangement with the same target sizes", () => {
    const blocks = poolBlocks(seeds(14), 2, { knockout: true, manual: true });
    expect(blocks[0].rows.map((r) => r.item)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(blocks[1].rows.map((r) => r.item)).toEqual([8, 9, 10, 11, 12, 13, 14]);
  });
});
