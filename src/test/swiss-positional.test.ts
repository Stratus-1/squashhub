import { describe, expect, it } from "vitest";
import {
  MIN_ENTRANTS, MAX_ENTRANTS, SPORTYHQ_REFERENCE_MAPS, applyResult, blocksForRound, categoryTemplate, finalRanking,
  nextRoundPreview, planCategory, simulateCategory, slotTemplate, validateTemplate,
} from "@/lib/tournaments/swiss-positional";

const seeds = (n: number, p = "p") => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
// Deterministic pseudo-random winner (LCG on the pair + round), so simulations cover upsets.
const rng = (salt: number) => (a: string, b: string, r: number) => {
  let h = salt + r * 131;
  for (const c of a + "|" + b) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 3 === 0 ? b : a;
};
const higherSeed = (a: string, b: string) => (Number(a.slice(1)) < Number(b.slice(1)) ? a : b);

describe("templates 8–32 (all counts, odd included)", () => {
  for (let n = MIN_ENTRANTS; n <= MAX_ENTRANTS; n++) {
    it(`${n} entrants: every round valid up to max rounds`, () => {
      const plan = planCategory(n);
      expect(validateTemplate(n, categoryTemplate(n, plan.maxRounds))).toEqual([]);
    });
  }
  it("round 1 is 1 v N fold; odd field gives the last slot the bye", () => {
    expect(slotTemplate(16, 1).pairs.map((p) => [p.a, p.b])).toEqual([[1, 16], [2, 15], [3, 14], [4, 13], [5, 12], [6, 11], [7, 10], [8, 9]]);
    const r = slotTemplate(15, 1);
    expect(r.bye).toBe(15);
    expect(r.pairs[0]).toMatchObject({ a: 1, b: 14 });
  });
  it("round 2 folds inside record blocks (16 → 1v8 … 9v16)", () => {
    expect(blocksForRound(16, 2)).toEqual([[1, 8], [9, 16]]);
    expect(slotTemplate(16, 2).pairs.map((p) => [p.a, p.b])).toEqual([[1, 8], [2, 7], [3, 6], [4, 5], [9, 16], [10, 15], [11, 14], [12, 13]]);
  });
  it("odd block floats its bottom slot into the next block (10, round 2)", () => {
    expect(blocksForRound(10, 2)).toEqual([[1, 5], [6, 10]]);
    expect(slotTemplate(10, 2).pairs.map((p) => [p.a, p.b])).toEqual([[1, 4], [2, 3], [5, 10], [6, 9], [7, 8]]);
  });
  it("rejects counts outside 8–32 and too many rounds", () => {
    expect(planCategory(7).issues.length).toBeGreaterThan(0);
    expect(planCategory(33).issues.length).toBeGreaterThan(0);
    expect(planCategory(10, 10).issues).toContain("10 entrants allow at most 9 rounds.");
  });
});

describe("progression rule", () => {
  it("1 v 16, 16 wins → 16 takes slot 1, 1 drops to slot 16", () => {
    const occ = applyResult(seeds(16), 1, 16, "p16");
    expect(occ[0]).toBe("p16");
    expect(occ[15]).toBe("p1");
  });
  it("better-slot winner keeps its slot; applying twice is idempotent", () => {
    const once = applyResult(seeds(8), 1, 8, "p1");
    expect(once).toEqual(seeds(8));
    expect(applyResult(once, 1, 8, "p1")).toEqual(once);
  });
  it("rejects a winner not in the match", () => {
    expect(() => applyResult(seeds(8), 1, 8, "p3")).toThrow();
  });
});

describe("per-category independence (one tournament, four categories)", () => {
  const cats = [
    { label: "Men's A", n: 10, rounds: 4 },
    { label: "Men's B", n: 15, rounds: 5 },
    { label: "Men's C", n: 24, rounds: 6 },
    { label: "Ladies A", n: 12, rounds: 3 },
    { label: "Ladies B", n: 18, rounds: 5 },
  ];
  it("each category keeps its own plan, rounds and match totals", () => {
    const plans = cats.map((c) => planCategory(c.n, c.rounds));
    expect(plans.map((p) => p.selectedRounds)).toEqual([4, 5, 6, 3, 5]);
    expect(plans.map((p) => p.recommendedRounds)).toEqual([4, 4, 5, 4, 5]);
    expect(plans.map((p) => p.estimatedMatches)).toEqual([20, 35, 72, 18, 45]);
    expect(plans.every((p) => p.issues.length === 0)).toBe(true);
  });
  it("categories progress independently (A at round 4 while B at round 2)", () => {
    const a = simulateCategory(seeds(10, "a"), 4, rng(1));
    const b = simulateCategory(seeds(15, "b"), 2, rng(2));
    expect(a.state.history).toHaveLength(4);
    expect(b.state.history).toHaveLength(2);
    expect(a.state.occupants.some((x) => x.startsWith("b"))).toBe(false);
  });
});

describe("simulations: no duplicates, no missing players, valid byes, rematch audit", () => {
  const cases: Array<[number, number]> = [[10, 4], [15, 5], [18, 5], [24, 6], [24, 5], [12, 3], [32, 5], [9, 8], [31, 5]];
  for (const [n, rounds] of cases) for (const salt of [1, 7, 42]) {
    it(`${n} entrants × ${rounds} rounds (salt ${salt})`, () => {
      const { state, resolved } = simulateCategory(seeds(n), rounds, rng(salt));
      for (const r of resolved) {
        const ids = r.pairs.flatMap((p) => [p.a, p.b]).concat(r.bye ? [r.bye.id] : []);
        expect(new Set(ids).size).toBe(n);                 // nobody twice, nobody missing
        expect(r.pairs.every((p) => p.a !== p.b && p.slotA < p.slotB)).toBe(true);
        expect(!!r.bye).toBe(n % 2 === 1);
      }
      const byes = state.history.map((h) => h.bye).filter(Boolean);
      expect(new Set(byes).size).toBe(byes.length);       // nobody gets a second bye (rounds ≤ n)
      expect(new Set(finalRanking(state).map((x) => x.id)).size).toBe(n);
      // Rematches are avoided when a swap exists; report any that remain.
      const total = resolved.reduce((s, r) => s + r.rematches, 0);
      // Guaranteed zero only for power-of-two fields within log2(N) rounds (floated slots can force a rare rematch).
      if ((n & (n - 1)) === 0 && rounds <= planCategory(n).cleanRounds) expect(total).toBe(0);
      else expect(total).toBeLessThanOrEqual(Math.floor(n / 2) * (rounds - planCategory(n).cleanRounds));
    });
  }
  it("audit: 10 entrants × 4 rounds over 50 result patterns keeps rematches rare (measured 4 in 200 rounds)", () => {
    let total = 0;
    for (let s = 1; s <= 50; s++) total += simulateCategory(seeds(10), 4, rng(s)).resolved.reduce((a, r) => a + r.rematches, 0);
    expect(total).toBeLessThanOrEqual(4);
  });
  it("power of two, random results: zero rematches within log2(N) rounds over 50 patterns", () => {
    for (let s = 1; s <= 50; s++) for (const n of [8, 16, 32]) expect(simulateCategory(seeds(n), Math.log2(n), rng(s)).resolved.every((r) => r.rematches === 0)).toBe(true);
  });
  it("power of two, favourites always win: final slots equal seeds, no rematches, no adjustments", () => {
    const { state, resolved } = simulateCategory(seeds(16), 4, higherSeed);
    expect(state.occupants).toEqual(seeds(16));
    expect(resolved.every((r) => r.rematches === 0 && !r.adjusted)).toBe(true);
  });
});

describe("unresolved opponents (immediate progression preview)", () => {
  it("next-round fixture: both pending → one side → provisional → ready", () => {
    const decided = new Set<number>();
    const status = () => nextRoundPreview(8, 1, (s) => decided.has(s)).find((p) => p.slotA === 1)!.status;
    expect(status()).toBe("both_pending");               // R2 slot 1 v slot 4
    decided.add(1);                                       // 1 v 8 decided
    expect(status()).toBe("one_side_pending");
    decided.add(4);                                       // 4 v 5 decided
    expect(status()).toBe("provisional");
    decided.add(2); decided.add(3);
    expect(status()).toBe("ready");
  });
});

describe("SportyHQ reference maps (owner-supplied)", () => {
  it("no maps encoded yet — equivalence is NOT claimed", () => {
    expect(Object.keys(SPORTYHQ_REFERENCE_MAPS)).toEqual([]);
  });
  for (const [n, rounds] of Object.entries(SPORTYHQ_REFERENCE_MAPS)) for (const [r, pairs] of Object.entries(rounds)) {
    it(`${n} entrants round ${r} matches SportyHQ`, () => {
      expect(slotTemplate(Number(n), Number(r)).pairs.map((p) => [p.a, p.b])).toEqual(pairs);
    });
  }
});
