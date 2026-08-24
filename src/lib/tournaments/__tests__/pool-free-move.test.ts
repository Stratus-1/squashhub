import { describe, expect, it } from "vitest";
import { hasCustomSizes, moveToPool, moveVisual, poolIndexes, poolSizes } from "../pools";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe("admin free pool moves", () => {
  it("keeps sizes when reordering inside one pool", () => {
    const res = moveVisual(ids(8), "p1", "p3", 2, { manual: true });
    expect(res).not.toBeNull();
    expect(res!.sizes).toEqual([4, 4]);
    expect(res!.ids.slice(0, 4)).toEqual(["p2", "p3", "p1", "p4"]);
    expect(res!.ids).toHaveLength(8);
  });

  it("moves an entrant across pools without a counter-swap", () => {
    // 9 entrants, 2 pools -> 5/4. Drag the 5th (pool A) into pool B.
    const before = ids(9);
    const res = moveVisual(before, "p5", "p7", 2, { manual: true });
    expect(res!.sizes).toEqual([4, 5]);
    expect(res!.ids).toHaveLength(9);
    expect(new Set(res!.ids)).toEqual(new Set(before));
    // Nobody was pushed back into pool A.
    const idx = poolIndexes(9, 2, { manual: true, sizes: res!.sizes });
    const poolB = res!.ids.filter((_, i) => idx[i] === 1);
    expect(poolB).toContain("p5");
  });

  it("persists custom sizes across a reload", () => {
    expect(hasCustomSizes(9, 2, { sizes: [4, 5] })).toBe(true);
    expect(poolSizes(9, 2, { sizes: [4, 5] })).toEqual([4, 5]);
    // Wrong totals are ignored and the balanced default returns.
    expect(poolSizes(9, 2, { sizes: [4, 4] })).toEqual([5, 4]);
    expect(poolSizes(9, 3, { sizes: [4, 5] })).toEqual([3, 3, 3]);
  });

  it("never loses an entrant when a pool is emptied out", () => {
    let list = ids(4);
    let sizes: number[] | undefined;
    for (const id of ["p3", "p4"]) {
      const res = moveToPool(list, id, 0, 2, { sizes });
      list = res!.ids;
      sizes = res!.sizes;
    }
    expect(sizes).toEqual([4, 0]);
    expect(new Set(list)).toEqual(new Set(ids(4)));
  });

  it("moves to a named pool and reports the new sizes", () => {
    const res = moveToPool(ids(6), "p1", 1, 2, undefined);
    expect(res!.sizes).toEqual([2, 4]);
    expect(res!.ids).toHaveLength(6);
    expect(moveToPool(ids(6), "p1", 0, 2, undefined)).toBeNull();
  });
});
