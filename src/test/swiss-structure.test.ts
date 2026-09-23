import { describe, expect, it } from "vitest";
import { firstRoundSwissPairs } from "@/lib/swiss-pairing";
import { knockoutSizeFor } from "@/lib/tournament-playoffs";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);

describe("Swiss first-round pairing", () => {
  it("pairs top half against bottom half", () => {
    const { pairs, bye } = firstRoundSwissPairs(seeds(10), "seeded");
    expect(bye).toBeNull();
    expect(pairs).toEqual([
      ["s1", "s6"],
      ["s2", "s7"],
      ["s3", "s8"],
      ["s4", "s9"],
      ["s5", "s10"],
    ]);
  });

  it("leaves the last seed without an opponent on an odd field", () => {
    const { pairs, bye } = firstRoundSwissPairs(seeds(7), "seeded");
    expect(bye).toBe("s7");
    expect(pairs).toHaveLength(3);
  });

  it("random keeps everybody in exactly one pairing", () => {
    const { pairs, bye } = firstRoundSwissPairs(seeds(8), "random", () => 0.42);
    const used = pairs.flat();
    expect(bye).toBeNull();
    expect(new Set(used).size).toBe(8);
  });
});

describe("Swiss knockout size", () => {
  it("honours the organiser's choice when the field allows it", () => {
    expect(knockoutSizeFor(12, 4)).toBe(4);
    expect(knockoutSizeFor(12, 8)).toBe(8);
    expect(knockoutSizeFor(12, 2)).toBe(2);
  });

  it("falls back to the largest bracket the field supports", () => {
    expect(knockoutSizeFor(5, 8)).toBe(4);
    expect(knockoutSizeFor(3, 8)).toBe(2);
  });

  it("uses the automatic size when nothing is chosen", () => {
    expect(knockoutSizeFor(9)).toBe(8);
    expect(knockoutSizeFor(5)).toBe(4);
    expect(knockoutSizeFor(3)).toBe(2);
  });
});
