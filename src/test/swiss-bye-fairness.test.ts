import { describe, it, expect } from "vitest";
import { slotTemplate, resolveRound, startState, applyResult } from "@/lib/tournaments/swiss-positional";

describe("Swiss bye fairness (odd fields)", () => {
  it("never gives the same player a second bye across 5 rounds with 9 players", () => {
    const ids = Array.from({ length: 9 }, (_, i) => `p${i + 1}`);
    let state = startState(ids);
    const byes: string[] = [];
    for (let r = 1; r <= 5; r++) {
      const res = resolveRound(state, r);
      expect(res.bye).not.toBeNull();
      byes.push(res.bye!.id);
      let occ = state.occupants;
      // higher slot (better) always wins — the bye holder would otherwise keep slot 9 forever
      for (const p of res.pairs) occ = applyResult(occ, p.slotA, p.slotB, occ[p.slotA - 1]);
      state = { occupants: occ, history: [...state.history, { round: r, pairs: res.pairs.map((p) => ({ a: p.a, b: p.b, winner: p.a })), bye: res.bye!.id }] };
    }
    expect(new Set(byes).size).toBe(5);
    expect(slotTemplate(9, 2).bye).toBe(9);
  });
});
