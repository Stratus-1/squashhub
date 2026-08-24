import { describe, expect, it } from "vitest";
import { distributeIntoPools, normalisePoolAllocation, poolCounts } from "@/lib/tournaments/pools";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("banded pool allocation", () => {
  it("puts the strongest seeds in pool A, the weakest in the last pool", () => {
    expect(distributeIntoPools(seeds(9), 3, { mode: "banded" })).toEqual([
      [1, 2, 3], [4, 5, 6], [7, 8, 9],
    ]);
  });

  it("keeps the same balanced sizes as the snake deal", () => {
    expect(poolCounts(9, 2, { mode: "banded" })).toEqual(poolCounts(9, 2));
    expect(distributeIntoPools(seeds(9), 2, { mode: "banded" })).toEqual([[1, 2, 3, 4, 5], [6, 7, 8, 9]]);
  });

  it("snake stays the default", () => {
    expect(distributeIntoPools(seeds(8), 2)).toEqual([[1, 4, 5, 8], [2, 3, 6, 7]]);
    expect(normalisePoolAllocation(undefined)).toBe("snake");
    expect(normalisePoolAllocation("banded")).toBe("banded");
  });
});
