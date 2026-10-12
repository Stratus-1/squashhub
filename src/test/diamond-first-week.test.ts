import { describe, it, expect } from "vitest";
import { poolRoundsWith } from "@/lib/tournaments/team-league";
const key = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
describe("first-week pairings", () => {
  for (const size of [4, 5, 6]) it(`size ${size} keeps a full round robin`, () => {
    const first: [number, number][] = size === 6 ? [[1, 3], [2, 4], [5, 6]] : size === 5 ? [[1, 3], [2, 4]] : [[1, 3], [2, 4]];
    const r = poolRoundsWith(size, first);
    expect(r[0]).toEqual(first);
    const all = r.flat().map(([a, b]) => key(a, b));
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe((size * (size - 1)) / 2);
  });
  it("invalid plan falls back", () => { expect(poolRoundsWith(4, [[1, 1], [2, 3]])[0]).toEqual([[1, 4], [2, 3]]); });
});
