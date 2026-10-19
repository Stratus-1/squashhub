import { describe, expect, it } from "vitest";
import { strictSwissPlan, opponentKey } from "@/lib/tournaments/swiss-no-repeat";
import { fixedPositionRound } from "@/lib/tournaments/engine-service";

describe("Shared Swiss no-repeat formula", () => {
  it("24 players play five rounds without repeated opponents, preserving rounds 1 and 2", () => {
    const d = { divisionId: "d", entrants: Array.from({ length: 24 }, (_, i) => ({ id: `p${i + 1}` })) } as any;
    const rows: any[] = [];
    const seen = new Set<string>();
    for (let round = 1; round <= 5; round++) {
      const pairs = fixedPositionRound(d, rows, round);
      expect(pairs).not.toBeNull();
      if (!pairs) return;
      if (round <= 2) expect(pairs).toEqual(fixedPositionRound(d, rows, round, false));
      expect(new Set(pairs.flat().filter(Boolean)).size).toBe(24);
      for (const [a, b] of pairs) {
        if (!b) continue;
        expect(seen.has(opponentKey(a, b))).toBe(false);
        seen.add(opponentKey(a, b));
        rows.push({ round, a, b, winner: a, status: "completed" });
      }
    }
    expect(seen.size).toBe(60);
  });
  it("repairs positions 3 and 7 when their actual players have already met", () => {
    const occupants = Array.from({ length: 24 }, (_, i) => `p${i + 1}`);
    const plan = strictSwissPlan({ occupants, round: 4, history: [{ round: 3, a: "p3", b: "p7" }] });
    expect(plan.ready).toBe(true);
    expect(plan.pairs.some((p) => p.a === 3 && p.b === 7)).toBe(false);
    expect(new Set(plan.pairs.flatMap((p) => [p.a, p.b])).size).toBe(24);
  });
  it("keeps confirmed games unchanged while repairing unsaved pairings", () => {
    const occupants = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    const plan = strictSwissPlan({ occupants, round: 3, history: [], locked: [{ a: "p1", b: "p8" }] });
    expect(plan.pairs).toContainEqual({ a: 1, b: 8 });
    expect(new Set(plan.pairs.flatMap((p) => [p.a, p.b])).size).toBe(8);
  });
  it("stops instead of silently repeating when no legal pairing exists", () => {
    const occupants = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    const history = occupants.slice(1).map((b) => ({ a: "p1", b, round: 1 }));
    const plan = strictSwissPlan({ occupants, round: 3, history });
    expect(plan.ready).toBe(false);
    expect(plan.issue).toMatch(/no pairing without repeat/);
  });
});