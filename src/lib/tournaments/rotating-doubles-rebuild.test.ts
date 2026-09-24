import { describe, it, expect } from "vitest";
import { generateRotatingDoublesSchedule as gen } from "./rotating-doubles";

const counts = (games: { sideA: string[]; sideB: string[] }[]) => {
  const c: Record<string, number> = {};
  for (const g of games) for (const p of [...g.sideA, ...g.sideB]) c[p] = (c[p] || 0) + 1;
  return c;
};

describe("rotating doubles rebuild", () => {
  const ten = Array.from({ length: 10 }, (_, i) => `p${i}`);

  it("10 active players with a target of 9 each reach 9 (top-up at most +1)", () => {
    const r = gen(ten, { maxMatchesPerPlayer: 9, topUpToTarget: true });
    const c = counts(r.games);
    for (const p of ten) {
      expect(c[p]).toBeGreaterThanOrEqual(9);
      expect(c[p]).toBeLessThanOrEqual(10);
    }
  });

  it("live rebuild counts played games and ignores withdrawn players", () => {
    // 12-player history: w1/w2 later withdrew.
    const all = [...ten, "w1", "w2"];
    const hist = gen(all, { maxMatchesPerPlayer: 9, topUpToTarget: true }).games.slice(0, 18);
    const r = gen(ten, { maxMatchesPerPlayer: 9, topUpToTarget: true, history: hist });
    for (const g of r.games) for (const p of [...g.sideA, ...g.sideB]) expect(p.startsWith("w")).toBe(false);
    const before = counts(hist);
    const after = counts(r.games);
    for (const p of ten) {
      const total = (before[p] || 0) + (after[p] || 0);
      expect(total).toBeGreaterThanOrEqual(9);
      expect(total).toBeLessThanOrEqual(10);
    }
  });
});
