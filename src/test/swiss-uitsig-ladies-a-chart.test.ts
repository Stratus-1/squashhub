import { describe, it, expect } from "vitest";
import { uitsigLadiesAChart, usesUitsigLadiesAChart } from "@/lib/tournaments/swiss-uitsig-ladies-a-chart";
import { buildProposedSwissGrid, buildSwissProgression } from "@/lib/tournaments/swiss-progression-view";

const club = "d8397b8a-60d3-4c4b-afee-25dab218bf19";
const tournament = "f954222a-0f0a-4d8c-ac7b-9c74042cc69e";
const expected = [
  [[1,8],[2,7],[3,6],[4,5],[9,null]],
  [[1,5],[2,4],[3,null],[6,9],[7,8]],
  [[1,4],[2,null],[3,5],[6,7],[8,9]],
  [[1,3],[2,5],[4,null],[6,8],[7,9]],
  [[1,2],[3,4],[5,null]],
];
const model = () => buildSwissProgression({ seedOrder: Array.from({ length: 9 }, (_,i) => `p${i+1}`), names: {}, totalRounds: 5, matches: [] });

describe("Uitsig Ladies A owner-approved chart", () => {
  it("retains three Round 1 results and the bye without inventing a result for the unplayed game", () => {
    const m = buildSwissProgression({
      seedOrder: Array.from({ length: 9 }, (_, i) => `p${i + 1}`), names: {}, totalRounds: 5,
      matches: [
        ...[[1, 8], [2, 7], [4, 5]].map(([a, b], i) => ({ id: `r1-${i}`, round: 1, a: `p${a}`, b: `p${b}`, winner: `p${a}`, status: "completed", score: "11-4, 11-2, 11-6" })),
        { id: "unplayed", round: 1, a: "p3", b: "p6", winner: null, status: "scheduled" },
        { id: "bye", round: 1, a: "p9", b: null, winner: "p9", isBye: true, status: "completed" },
      ],
    });
    const snapshot = JSON.stringify(m);
    const grid = buildProposedSwissGrid(m, { exactLadiesAChart: true });
    expect(grid.rounds[0].blocks.map(b => b.rows.map(r => r.pos))).toEqual(expected[0]);
    expect(grid.rounds[0].blocks.filter(b => b.score === "3–0")).toHaveLength(3);
    expect(grid.rounds[0].blocks.find(b => b.rows[0].pos === 3)).toMatchObject({ score: null, rows: [{ result: "" }, { result: "" }] });
    expect(grid.rounds[0].blocks.find(b => b.matchId === "bye")?.rows[0]).toMatchObject({ id: "p9", pos: 9, result: "Bye" });
    expect(grid.rounds[4].blocks.map(b => b.rows.map(r => r.pos))).toEqual(expected[4]);
    expect(JSON.stringify(m)).toBe(snapshot);
  });
  it.each([1,2,3,4,5])("copies every pairing in supplied round %i exactly, including the bye", round => {
    const grid = buildProposedSwissGrid(model(), { exactLadiesAChart: true });
    expect(grid.issues).toEqual([]);
    expect(grid.rounds[round-1].blocks.map(b => b.rows.map(r => r.pos))).toEqual(expected[round-1]);
  });
  it("sits positions 6-9 out of Round 5 with no games", () => {
    const r5 = uitsigLadiesAChart()[4];
    expect(r5.pairs.map(p => [p.a, p.b])).toEqual([[1,2],[3,4]]);
    expect(r5.bye).toBe(5);
    const used = new Set(r5.pairs.flatMap(p => [p.a, p.b]).concat([r5.bye]));
    expect([6,7,8,9].every(p => !used.has(p))).toBe(true);
  });
  it("keeps every bye different across the five rounds", () => {
    expect(uitsigLadiesAChart().map(r => r.bye)).toEqual([9,3,2,4,5]);
  });
  it("fails closed outside the exact club, tournament, group and field size", () => {
    expect(usesUitsigLadiesAChart(club,tournament,6,9,5)).toBe(true);
    expect(usesUitsigLadiesAChart("other",tournament,6,9,5)).toBe(false);
    expect(usesUitsigLadiesAChart(club,"other",6,9,5)).toBe(false);
    expect(usesUitsigLadiesAChart(club,tournament,5,9,5)).toBe(false);
    expect(usesUitsigLadiesAChart(club,tournament,6,8,5)).toBe(false);
    expect(usesUitsigLadiesAChart(club,tournament,6,9,4)).toBe(false);
  });
  it("leaves the default model unchanged and retains saved games", () => {
    const m = model();
    const before = buildProposedSwissGrid(m);
    m.rounds[1].fixtures = [{ id:"saved",round:2,state:"completed",a:"p1",b:"p2",aLabel:"Player 1",bLabel:"Player 2",winner:"p2",loser:"p1",score:"3-1",when:"2026-10-22 18:00",court:"Court 1",playBy:"2026-10-29" }];
    m.rounds[1].created = true;
    const snapshot = JSON.stringify(m);
    const exact = buildProposedSwissGrid(m, { exactLadiesAChart:true });
    expect(exact.rounds[1].blocks.map(b => b.rows.map(r => r.pos))).toEqual(expected[1]);
    expect(buildProposedSwissGrid(m).rounds[1].blocks.map(b => b.rows.map(r => r.pos))).not.toEqual(expected[1]);
    expect(JSON.stringify(m)).toBe(snapshot);
    expect(buildProposedSwissGrid(model())).toEqual(before);
  });
});
