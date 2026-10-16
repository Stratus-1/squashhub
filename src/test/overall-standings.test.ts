import { describe, it, expect } from "vitest";
import { overallStandings, ladderAfterStandings } from "@/lib/tournaments/overall-standings";

const seeds = Array.from({ length: 18 }, (_, i) => `p${i + 1}`);
const g = (bracket: number, round: number, a: string, b: string, winner: string | null) => ({ bracket, round, a, b, winner });

describe("overall standings", () => {
  it("top half 1-8, bottom half 9-16, rest by Swiss position; semi-final losers split by better seed", () => {
    const games = [
      g(1, 1, "p1", "p8", "p1"), g(1, 1, "p4", "p5", "p5"), g(1, 1, "p2", "p7", "p2"), g(1, 1, "p3", "p6", "p3"),
      g(1, 2, "p1", "p5", "p5"), g(1, 2, "p2", "p3", "p2"), g(1, 3, "p5", "p2", "p2"),
      g(2, 1, "p9", "p16", "p9"), g(2, 1, "p12", "p13", "p12"), g(2, 1, "p10", "p15", "p10"), g(2, 1, "p11", "p14", "p11"),
      g(2, 2, "p9", "p12", "p9"), g(2, 2, "p10", "p11", "p11"), g(2, 3, "p9", "p11", "p11"),
    ];
    const r = overallStandings(seeds, games);
    expect(r.complete).toBe(true);
    expect(r.rows.map((x) => x.id)).toEqual(["p2", "p5", "p1", "p3", "p4", "p6", "p7", "p8", "p11", "p9", "p10", "p12", "p13", "p14", "p15", "p16", "p17", "p18"]);
  });
  it("is provisional while a play-off game is undecided", () => {
    expect(overallStandings(["a", "b"], [g(1, 1, "a", "b", null)]).complete).toBe(false);
  });
  it("ladder: category players swap among their own spots, others stay put", () => {
    expect(ladderAfterStandings(["x", "a", "y", "b", "c"], ["c", "a", "b"])).toEqual(["x", "c", "y", "a", "b"]);
  });
});
