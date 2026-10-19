import { describe, it, expect } from "vitest";
import { fixedPositionRound } from "@/lib/tournaments/engine-service";
import { generateCategoryDraw, resolveCategoryDraw, type DrawResults } from "@/lib/tournaments/swiss-positional-draw";

const div = (n: number) => ({ divisionId: "d", entrants: Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })) }) as any;

function play(n: number, rounds: number) {
  const entrants = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `p${i + 1}` }));
  const draw = generateCategoryDraw({ categoryKey: "c", label: "c", entrants, rounds });
  const results: DrawResults = {};
  const rows: any[] = [];
  for (let r = 1; r <= rounds; r++) {
    const live = fixedPositionRound(div(n), rows, r, false)!;
    const grid = resolveCategoryDraw(draw, results).rounds[r - 1];
    expect(live.filter(([, b]) => b).map(([a, b]) => [a, b])).toEqual(grid.fixtures.map((f) => [f.a!.id, f.b!.id]));
    grid.fixtures.forEach((f, i) => {
      const w = (f.match + r) % 3 ? "a" : "b"; // mixed upsets
      results[f.key] = { winner: w };
      rows.push({ divisionId: "d", stageId: "s", stageKind: "swiss", round: r, a: f.a!.id, b: f.b!.id, winner: w === "a" ? f.a!.id : f.b!.id, status: "completed" });
    });
    if (grid.bye) rows.push({ divisionId: "d", stageId: "s", stageKind: "swiss", round: r, a: grid.bye.entrant!.id, b: null });
    const ids = live.flat().filter(Boolean);
    expect(new Set(ids).size).toBe(n);
  }
}

describe("Original fixed-position maps retained for historical replay", () => {
  for (const [n, r] of [[10, 4], [15, 4], [16, 4], [18, 4], [24, 5]]) it(`${n} players × ${r} rounds matches preview grid`, () => play(n, r));
  it("round 1 is top v bottom", () => expect(fixedPositionRound(div(24), [], 1)![0]).toEqual(["p1", "p24"]));
  it("falls back when earlier rounds were drawn dynamically", () => {
    const rows = [{ divisionId: "d", stageId: "s", stageKind: "swiss", round: 1, a: "p1", b: "p2", winner: "p1" }];
    expect(fixedPositionRound(div(8), rows as any, 2)).toBeNull();
  });
  it("falls back outside 8–32 players", () => expect(fixedPositionRound(div(6), [], 1)).toBeNull());
});
