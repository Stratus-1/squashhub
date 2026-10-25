import { describe, expect, it } from "vitest";
import { BellsFormat } from "@/lib/tournament-formats/bells";
import { buildRoundRobinView } from "@/lib/tournaments/round-robin-view";

describe("Bells accumulated points", () => {
  it("56 points ranks above 45 even when win/loss totals favour 45", () => {
    const lower = { pointsFor: 45, pointsDiff: 45, played: 1, won: 3, lost: 0 };
    const higher = { pointsFor: 56, pointsDiff: -20, played: 1, won: 0, lost: 3 };
    expect(BellsFormat.rankStandings(higher as any, lower as any)).toBeLessThan(0);
  });
  it("accumulates completed drawn Bells points without a winner; excludes unplayed points", () => {
    const v = buildRoundRobinView({ pointsScoring: true,
      players: ["a", "b", "c"].map(id => ({ id, name: id })), rankOrder: ["a", "b", "c"], seedOrder: ["a", "b", "c"],
      matches: [
        { id: "draw", round: 1, a: "a", b: "b", winner: null, status: "completed", score: "20-20" },
        { id: "win", round: 2, a: "a", b: "c", winner: "a", status: "completed", score: "45-10" },
        { id: "pending", round: 3, a: "b", b: "c", status: "scheduled", score: "90-80" },
      ],
    });
    expect(v.totals.a.pointsFor).toBe(65);
    expect(v.totals.a.played).toBe(2);
    expect(v.totals.b.pointsFor).toBe(20);
    expect(v.totals.c.pointsFor).toBe(10);
    expect(v.rank).toEqual({ a: 1, b: 2, c: 3 });
  });
});