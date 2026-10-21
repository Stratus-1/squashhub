import { describe, it, expect } from "vitest";
import { sixteenPlayerChart, usesAabbEighteenChart, usesAabbSixteenChart, RIVERSIDE_CLUB_ID, RIVERSIDE_AABB_ID } from "@/lib/tournaments/swiss-riverside-aabb-charts";
import { validateTemplate } from "@/lib/tournaments/swiss-positional";

describe("Riverside AABB Swiss charts", () => {
  it("16-player chart matches the approved model with no repeated pairs", () => {
    const c = sixteenPlayerChart();
    expect(validateTemplate(16, c)).toEqual([]);
    expect(c[0].pairs.map((p) => [p.a, p.b])[0]).toEqual([1, 16]);
    expect(c[1].pairs.map((p) => `${p.a}v${p.b}`)).toEqual(["1v8","2v7","3v6","4v5","9v16","10v15","11v14","12v13"]);
    expect(c[4].pairs.map((p) => `${p.a}v${p.b}`)).toEqual(["1v2","3v4","5v6","7v8","9v10","11v12","13v14","15v16"]);
    const keys = c.flatMap((r) => r.pairs.map((p) => `${p.a}v${p.b}`));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("only applies to AABB at Riverside with 16/18 players and 5 rounds", () => {
    expect(usesAabbSixteenChart(RIVERSIDE_CLUB_ID, RIVERSIDE_AABB_ID, 16, 5)).toBe(true);
    expect(usesAabbEighteenChart(RIVERSIDE_CLUB_ID, RIVERSIDE_AABB_ID, 18, 5)).toBe(true);
    expect(usesAabbEighteenChart(RIVERSIDE_CLUB_ID, "other", 18, 5)).toBe(false);
    expect(usesAabbSixteenChart("uitsig", RIVERSIDE_AABB_ID, 16, 5)).toBe(false);
    expect(usesAabbSixteenChart(RIVERSIDE_CLUB_ID, RIVERSIDE_AABB_ID, 22, 5)).toBe(false);
  });
});
