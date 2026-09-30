import { describe, it, expect } from "vitest";
import { diamondSemiTies, diamondFinalTies, CROSSOVER, PLACING_FINALS } from "@/lib/tournaments/team-league";

describe("Diamond League play-off builders", () => {
  const aOrder = ["a1", "a2", "a3", "a4"];
  const bOrder = ["b1", "b2", "b3", "b4"];
  const courtOf = (i: number) => (i % 2) + 1;

  it("semi ties cross over pool position: A1 v B2, A2 v B1, A3 v B4, A4 v B3", () => {
    const ties = diamondSemiTies(aOrder, bOrder, courtOf);
    expect(ties.map((t) => t.id)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(ties.map((t) => [t.home, t.away])).toEqual([
      ["a1", "b2"], ["a2", "b1"], ["a3", "b4"], ["a4", "b3"],
    ]);
    expect(ties.every((t, k) => t.court === courtOf(k))).toBe(true);
    expect(ties.every((t) => t.label?.startsWith("Match"))).toBe(true);
  });

  it("final ties pair winners/losers per placing table", () => {
    const winners = [
      { W: "s1w", L: "s1l" }, { W: "s2w", L: "s2l" }, { W: "s3w", L: "s3l" }, { W: "s4w", L: "s4l" },
    ];
    const ties = diamondFinalTies(winners, courtOf);
    expect(ties.map((t) => t.id)).toEqual(PLACING_FINALS.map((f) => `f${f.places[0]}`));
    expect(ties[0]).toMatchObject({ home: "s1w", away: "s2w" });
    expect(ties[1]).toMatchObject({ home: "s1l", away: "s2l" });
    expect(ties[2]).toMatchObject({ home: "s3w", away: "s4w" });
    expect(ties[3]).toMatchObject({ home: "s3l", away: "s4l" });
  });

  it("matches the shared crossover and placing tables", () => {
    expect(CROSSOVER.map((c) => `s${c.match}`)).toEqual(diamondSemiTies(aOrder, bOrder, courtOf).map((t) => t.id));
    expect(PLACING_FINALS).toHaveLength(4);
  });
});
