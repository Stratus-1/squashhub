import { describe, expect, it } from "vitest";
import { settledSwiss, MAX_SETTLED_OUTSTANDING } from "../swiss-settled";
import type { SwissGame } from "../swiss-standings";

const P = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];
const win = (a: string, b: string, round: number): SwissGame => ({ a, b, winner: a, round });

/**
 * Round 1: P1vP8, P2vP7, P3vP6, P4vP5 (all seeds 1-4 win).
 * Round 2 decided: P1vP4, P2vP3, P8vP5. Outstanding: P6 v P7.
 * Hand-verified: P1-P4 hold ranks 1-4 in BOTH outcomes of P6 v P7; P5-P8 do not.
 */
const decided: SwissGame[] = [
  win("P1", "P8", 1), win("P2", "P7", 1), win("P3", "P6", 1), win("P4", "P5", 1),
  win("P1", "P4", 2), win("P2", "P3", 2), win("P8", "P5", 2),
];

describe("settledSwiss", () => {
  it("keeps only positions and pairings identical across every outcome of the outstanding game", () => {
    const r = settledSwiss({ seedOrder: P, decidedGames: decided, outstanding: [{ a: "P6", b: "P7" }], round: 3, finalRound: 5 });
    expect(r.enumerable).toBe(true);
    expect(r.scenarios).toBe(2);
    expect(Object.fromEntries(r.settledPositions)).toEqual({ P1: 1, P2: 2, P3: 3, P4: 4 });
    // The top fixture is provably stable; nothing involving an unsettled or undecided player is offered.
    expect(r.stablePairs).toContainEqual(expect.arrayContaining(["P1", "P2"]));
    for (const [a, b] of r.stablePairs) {
      expect(["P1", "P2", "P3", "P4"]).toContain(a);
      expect(["P1", "P2", "P3", "P4"]).toContain(b);
    }
  });

  it("never offers a pair involving a player whose own game is undecided, even if pairing-stable", () => {
    const r = settledSwiss({ seedOrder: P, decidedGames: decided, outstanding: [{ a: "P6", b: "P7" }], round: 3, finalRound: 5 });
    expect(r.stablePairs.flat()).not.toContain("P6");
    expect(r.stablePairs.flat()).not.toContain("P7");
  });

  it("with no outstanding games every position is settled and the full round pairing is stable", () => {
    const r = settledSwiss({ seedOrder: P, decidedGames: [...decided, win("P6", "P7", 2)], outstanding: [], round: 3, finalRound: 5 });
    expect(r.enumerable).toBe(true);
    expect(r.scenarios).toBe(1);
    expect(r.settledPositions.size).toBe(8);
    expect(r.stablePairs.length).toBe(4);
  });

  it("falls back to all-or-nothing beyond the outstanding-game cap", () => {
    const outstanding = Array.from({ length: MAX_SETTLED_OUTSTANDING + 1 }, (_, i) => ({ a: `A${i}`, b: `B${i}` }));
    const r = settledSwiss({ seedOrder: outstanding.flatMap((g) => [g.a, g.b]), decidedGames: [], outstanding, round: 2, finalRound: 5 });
    expect(r.enumerable).toBe(false);
    expect(r.stablePairs).toEqual([]);
    expect(r.settledPositions.size).toBe(0);
  });

  it("refuses malformed outstanding games", () => {
    const r = settledSwiss({ seedOrder: P, decidedGames: decided, outstanding: [{ a: "P6", b: "P6" }], round: 3, finalRound: 5 });
    expect(r.enumerable).toBe(false);
  });
});
