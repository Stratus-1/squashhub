import { describe, it, expect } from "vitest";
import {
  distributeIntoPools,
  flattenPools,
  poolBlocks,
  poolCounts,
  poolIndexes,
  poolLetter,
  snakePoolIndex,
} from "@/lib/tournaments/pools";
import { sortDivisionEntrants } from "@/lib/tournaments/seeding";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("serpentine pool distribution", () => {
  it("2 pools / 8 seeds → A 1,4,5,8 · B 2,3,6,7", () => {
    const [a, b] = distributeIntoPools(seeds(8), 2);
    expect(a).toEqual([1, 4, 5, 8]);
    expect(b).toEqual([2, 3, 6, 7]);
  });

  it("2 pools / 9 seeds → A 1,4,5,8,9 · B 2,3,6,7", () => {
    const [a, b] = distributeIntoPools(seeds(9), 2);
    expect(a).toEqual([1, 4, 5, 8, 9]);
    expect(b).toEqual([2, 3, 6, 7]);
  });

  it("4 pools spread the top seeds one per pool", () => {
    const pools = distributeIntoPools(seeds(10), 4);
    expect(pools.map((p) => p[0])).toEqual([1, 2, 3, 4]);
    expect(pools).toEqual([[1, 8, 9], [2, 7, 10], [3, 6], [4, 5]]);
  });

  it("8 pools with an uneven count stay balanced within one entrant", () => {
    const pools = distributeIntoPools(seeds(19), 8);
    const counts = pools.map((p) => p.length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(19);
    expect(pools[0]).toEqual([1, 16, 17]);
  });

  it("never leaves a pool empty when entrants outnumber pools", () => {
    expect(poolCounts(5, 4)).toEqual([1, 1, 1, 2]);
    expect(poolCounts(3, 1)).toEqual([3]);
  });

  it("places unranked entrants after ranked ones and spreads them", () => {
    const entrants = [
      { id: "a", ladder_position: 3 },
      { id: "b", ladder_position: 9 },
      { id: "c", ladder_position: 10 },
      { id: "u1", ladder_position: null },
      { id: "u2", ladder_position: null },
    ];
    const ordered = sortDivisionEntrants(entrants);
    const [poolA, poolB] = distributeIntoPools(ordered, 2);
    expect(poolA.map((e) => e.id)).toEqual(["a", "u1", "u2"]);
    expect(poolB.map((e) => e.id)).toEqual(["b", "c"]);
    // one unranked in each pool would be ideal but never at the cost of
    // seed order — they always follow every ranked entrant
    expect(poolA.slice(0, 1).every((e) => e.ladder_position)).toBe(true);
  });

  it("balances each division independently (multi-division entrant)", () => {
    const d1 = distributeIntoPools(["x", "y", "z", "w"], 2);
    const d2 = distributeIntoPools(["x", "q"], 2);
    expect(d1[0]).toEqual(["x", "w"]);
    expect(d2[0]).toEqual(["x"]);
    expect(d2[1]).toEqual(["q"]);
  });

  it("preserves a manual arrangement with a contiguous block split", () => {
    const manual = distributeIntoPools(seeds(8), 2, { manual: true });
    expect(manual).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
  });

  it("exposes row-aligned pool indexes and labels", () => {
    expect(poolIndexes(6, 2)).toEqual([0, 1, 1, 0, 0, 1]);
    expect(snakePoolIndex(0, 1)).toBe(0);
    expect(poolLetter(0)).toBe("A");
    expect(poolLetter(3)).toBe("D");
  });
});

describe("pools render as separate blocks (never interleaved)", () => {
  const nelspruit = [
    { id: "p1", ladder_position: 1 },
    { id: "p2", ladder_position: 2 },
    { id: "p3", ladder_position: 3 },
    { id: "p4", ladder_position: 4 },
    { id: "p5", ladder_position: 5 },
    { id: "p6", ladder_position: 6 },
    { id: "p7", ladder_position: 7 },
    { id: "p8", ladder_position: 8 },
    { id: "p9", ladder_position: 9 },
  ];

  it("Nelspruit 1st League: 9 players / 2 pools → Pool A and Pool B as two lists", () => {
    const blocks = poolBlocks(sortDivisionEntrants(nelspruit), 2);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].letter).toBe("A");
    expect(blocks[1].letter).toBe("B");
    expect(blocks[0].rows.map((r) => r.seed)).toEqual([1, 4, 5, 8, 9]);
    expect(blocks[1].rows.map((r) => r.seed)).toEqual([2, 3, 6, 7]);
    expect(blocks[0].rows.map((r) => r.item.id)).toEqual(["p1", "p4", "p5", "p8", "p9"]);
    expect(blocks[1].rows.map((r) => r.item.id)).toEqual(["p2", "p3", "p6", "p7"]);
    // No block mixes pools: every row inside a block belongs to that pool.
    const flat = blocks.flatMap((b) => b.rows.map(() => b.letter));
    expect(flat).toEqual(["A", "A", "A", "A", "A", "B", "B", "B", "B"]);
  });

  it("block membership matches what draw-prep generates", () => {
    const ordered = sortDivisionEntrants(nelspruit);
    const blocks = poolBlocks(ordered, 2);
    const drawPools = distributeIntoPools(ordered, 2);
    expect(blocks.map((b) => b.rows.map((r) => r.item.id))).toEqual(
      drawPools.map((p) => p.map((e) => e.id)),
    );
  });

  it("works for 4 and 8 pools", () => {
    expect(poolBlocks(seeds(12), 4).map((b) => b.rows.map((r) => r.item))).toEqual([
      [1, 8, 9], [2, 7, 10], [3, 6, 11], [4, 5, 12],
    ]);
    const eight = poolBlocks(seeds(17), 8);
    expect(eight).toHaveLength(8);
    expect(eight.reduce((n, b) => n + b.rows.length, 0)).toBe(17);
  });

  it("a manual arrangement still renders as separate blocks with balanced sizes", () => {
    const blocks = poolBlocks(seeds(9), 2, { manual: true });
    expect(blocks[0].rows.map((r) => r.item)).toEqual([1, 2, 3, 4, 5]);
    expect(blocks[1].rows.map((r) => r.item)).toEqual([6, 7, 8, 9]);
  });

  it("flattening the seeded blocks preserves pool membership when stored as manual order", () => {
    for (const pools of [2, 4, 8]) {
      const ordered = seeds(19);
      const seeded = poolBlocks(ordered, pools).map((b) => b.rows.map((r) => r.item));
      const stored = flattenPools(ordered, pools);
      const afterManual = poolBlocks(stored, pools, { manual: true }).map((b) =>
        b.rows.map((r) => r.item),
      );
      expect(afterManual).toEqual(seeded);
    }
  });
});
