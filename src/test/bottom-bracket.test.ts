import { describe, it, expect } from "vitest";
import { nextKnockoutRound } from "@/lib/tournaments/structured-persist";
import type { FixtureRow } from "@/lib/tournaments/contract";

const g = (pool: number, slot: number, a: string, b: string, winner: string): FixtureRow =>
  ({ divisionId: "d", stageId: "ko", stageKind: "knockout", round: 1, a, b, winner, pool, slot } as any);

describe("bottom bracket semi-finals", () => {
  it("each bracket gets its own final; 5-8 never meet 1-4", () => {
    const rows = [g(1, 1, "p1", "p4", "p1"), g(1, 2, "p2", "p3", "p2"), g(2, 3, "p5", "p8", "p5"), g(2, 4, "p6", "p7", "p7")];
    const next = nextKnockoutRound("t", "d", "ko", rows);
    expect(next.map((f) => [f.koPool, f.a, f.b])).toEqual([[1, "p1", "p2"], [2, "p5", "p7"]]);
  });
});
