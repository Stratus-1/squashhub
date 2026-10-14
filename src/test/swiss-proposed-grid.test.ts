import { describe, it, expect } from "vitest";
import { buildProposedSwissGrid, buildSwissGrid, buildSwissProgression } from "@/lib/tournaments/swiss-progression-view";
import { categoryTemplate } from "@/lib/tournaments/swiss-positional";

const modelFor = (n: number, rounds: number) => buildSwissProgression({
  seedOrder: Array.from({ length: n }, (_, i) => `p${i + 1}`), names: {}, totalRounds: rounds, matches: [],
});

describe("Proposed Swiss grid isolated from live score-based fixtures", () => {
  it("24 entrants: exact round 2 halves and later slide templates", () => {
    const { rounds, issues } = buildProposedSwissGrid(modelFor(24, 5));
    expect(issues).toEqual([]);
    const pairs = (r: number) => rounds[r - 1].blocks.map((b) => b.rows.map((x) => x.pos));
    expect(pairs(2)).toEqual([[1,12],[2,11],[3,10],[4,9],[5,8],[6,7],[13,24],[14,23],[15,22],[16,21],[17,20],[18,19]]);
    expect(pairs(3)).toEqual([[1,3],[2,4],[5,7],[6,8],[9,11],[10,12],[13,15],[14,16],[17,19],[18,20],[21,23],[22,24]]);
    expect(pairs(4)).toEqual([[1,5],[2,6],[3,7],[4,8],[9,13],[10,14],[11,15],[12,16],[17,21],[18,22],[19,23],[20,24]]);
    expect(pairs(5)).toEqual([[1,9],[2,10],[3,11],[4,12],[5,13],[6,14],[7,15],[8,16],[17,21],[18,22],[19,23],[20,24]]);
  });
  it.each([[24,5],[18,4],[16,4],[10,4],[15,5]])("%i entrants, %i rounds: no missing/duplicate slots, stable maps and valid byes", (n, r) => {
    const model = modelFor(n, r);
    const grid = buildProposedSwissGrid(model);
    expect(grid.issues).toEqual([]);
    expect(buildProposedSwissGrid(model)).toEqual(grid);
    grid.rounds.forEach((rd, index) => {
      const slots = rd.blocks.flatMap((b) => b.rows.map((x) => x.pos)).filter((x) => x != null);
      expect(slots.slice().sort((a,b) => a-b)).toEqual(Array.from({length:n},(_, i) => i+1));
      expect(rd.blocks.filter((b) => b.rows[1].name === "Bye").length).toBe(n % 2);
      expect(rd.blocks.filter((b) => b.rows[1].pos != null).map((b) => b.rows.map((x) => x.pos))).toEqual(categoryTemplate(n,r)[index].pairs.map((p) => [p.a,p.b]));
    });
  });
  it("copies saved round 1 exactly but never imports live round 2 players/results/scheduling", () => {
    const model = modelFor(8,3);
    model.rounds[0] = { round:1, created:true, complete:true, fixtures:[{ id:"saved", round:1, state:"completed", a:"p1", b:"p2", aLabel:"Saved A", bLabel:"Saved B", winner:"p2", loser:"p1", score:"3-1", when:"2026-10-14 18:00", court:"Court 1", playBy:null }] };
    model.rounds[1] = { ...model.rounds[0], round:2 };
    const snapshot = JSON.stringify(model);
    const preview = buildProposedSwissGrid(model);
    expect(preview.rounds[0]).toEqual(buildSwissGrid(model)[0]);
    expect(preview.rounds[1].blocks.every((b) => b.rows.every((x) => x.id === null && x.name === "TBD" && x.result === "" && x.when === null) && b.court === null && b.score === null)).toBe(true);
    expect(JSON.stringify(model)).toBe(snapshot);
  });
  it("unsupported entrant count fails visibly instead of inventing positions", () => {
    expect(buildProposedSwissGrid(modelFor(5,3)).rounds).toEqual([]);
    expect(buildProposedSwissGrid(modelFor(5,3)).issues.length).toBeGreaterThan(0);
  });
});