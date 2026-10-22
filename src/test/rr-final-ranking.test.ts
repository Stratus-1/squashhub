import { describe, it, expect } from "vitest";
import { rrFinalRanking } from "@/lib/tournaments/rr-final-ranking";

const ids = ["a", "b", "c", "d", "e", "f"];
const rows = ids.map((id, i) => ({ id, name: id, swissFinalPosition: i + 1 })) as any;
const f = (round: number, a: string, b: string, winner: string) => ({ round, a, b, winner });
const model = (complete: boolean) => ({
  rows, swissStageComplete: complete, configuredRounds: 5, rrFinish: { enabled: true, groups: 1 },
  rounds: [3, 4, 5].map((round) => ({ round, fixtures: [] as any[] })),
}) as any;

describe("final ranking after the group round robin", () => {
  it("re-orders the group of 4 by its own results and keeps the Swiss rest in place", () => {
    const m = model(true);
    m.rounds[0].fixtures = [f(3, "a", "d", "d"), f(3, "b", "c", "c")];
    m.rounds[1].fixtures = [f(4, "a", "c", "c"), f(4, "b", "d", "d")];
    m.rounds[2].fixtures = [f(5, "a", "b", "a"), f(5, "c", "d", "d")];
    expect(rrFinalRanking(m)!.map((r) => r.id)).toEqual(["d", "c", "a", "b", "e", "f"]);
  });
  it("shows nothing until every round is played", () => {
    expect(rrFinalRanking(model(false))).toBeNull();
  });
});
