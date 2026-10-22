import { describe, expect, it } from "vitest";
import { nextSwissRound, type SpecDivision } from "@/lib/tournaments/engine-service";

// Riverside Ladies B rule: R3–R5 must generate even when the fixed RR groups repeat a Round 1–2 opponent
// (the organiser approved repeats for the ten-player position-swap chart).
const seeds = Array.from({ length: 18 }, (_, i) => `p${i + 1}`);
const finish = { enabled: true, groups: 2, remainderChart: "ten_position_swap" };
const division = { divisionId: "g2", entrants: seeds.map((id, i) => ({ id, rank: i + 1 })), stages: [{ id: "s", kind: "swiss", order: 0, swissRounds: 5, rrFinish: finish, tieBreaks: ["position_swap"] }] } as unknown as SpecDivision;
const row = (round: number, a: string, b: string) => ({ id: `${round}-${a}-${b}`, a, b, winner: a, round, status: "completed", divisionId: "g2", stageId: "s", stageKind: "swiss" as const });

describe("ten-player chart generation with group repeats", () => {
  it("generates nine games in each of Rounds 3, 4 and 5", () => {
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => row(1, seeds[i], seeds[i + 9])),
      // Round 2 puts 1 v 4 and 5 v 8 together: both pairs land in the same fixed group.
      ...[[1, 4], [2, 3], [5, 8], [6, 7], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18]].map(([a, b]) => row(2, `p${a}`, `p${b}`)),
    ];
    for (const round of [3, 4, 5]) {
      const games = nextSwissRound("test", division, "s", rows);
      expect(games).toHaveLength(9);
      expect(games.every((g) => g.round === round)).toBe(true);
      expect(new Set(games.flatMap((g) => [g.a, g.b])).size).toBe(18);
      games.forEach((g) => rows.push(row(round, String(g.a), String(g.b))));
    }
  });
});
