import { describe, it, expect } from "vitest";
import { uitsigMensCChart, usesUitsigMensCChart } from "@/lib/tournaments/swiss-uitsig-mens-c-chart";
import { buildProposedSwissGrid, buildSwissGrid, buildSwissProgression } from "@/lib/tournaments/swiss-progression-view";

const club = "d8397b8a-60d3-4c4b-afee-25dab218bf19";
const tournament = "f954222a-0f0a-4d8c-ac7b-9c74042cc69e";
const expected = [
  [[1,18],[2,17],[3,16],[4,15],[5,14],[6,13],[7,12],[8,11],[9,10]],
  [[1,9],[2,8],[3,7],[4,6],[5,10],[11,18],[12,17],[13,16],[14,15]],
  [[1,4],[2,3],[5,8],[6,7],[9,12],[10,11],[13,17],[14,18],[15,16]],
  [[1,3],[2,4],[5,7],[6,8],[9,11],[10,12],[13,15],[14,17],[16,18]],
  [[1,2],[3,4],[5,6],[7,8],[9,10],[11,12],[13,14],[15,16],[17,18]],
];
const model = () => buildSwissProgression({ seedOrder: Array.from({ length: 18 }, (_,i) => `p${i+1}`), names: {}, totalRounds: 5, matches: [] });

describe("Uitsig Men's C owner-approved chart", () => {
  it.each([1,2,3,4,5])("copies every pairing in supplied round %i exactly", round => {
    const grid = buildProposedSwissGrid(model(), { exactMensCChart: true });
    expect(grid.issues).toEqual([]);
    expect(grid.rounds[round-1].blocks.map(b => b.rows.map(r => r.pos))).toEqual(expected[round-1]);
  });
  it("retains the explicitly approved 9v10 and 15v16 repeats", () => {
    const rounds = uitsigMensCChart();
    const appearances = (a: number, b: number) => rounds.filter(r => r.pairs.some(p => p.a === a && p.b === b)).map(r => r.round);
    expect(appearances(9,10)).toEqual([1,5]);
    expect(appearances(15,16)).toEqual([3,5]);
  });
  it("fails closed outside the exact club, tournament, group and field size", () => {
    expect(usesUitsigMensCChart(club,tournament,4,18,5)).toBe(true);
    expect(usesUitsigMensCChart("other",tournament,4,18,5)).toBe(false);
    expect(usesUitsigMensCChart(club,"other",4,18,5)).toBe(false);
    expect(usesUitsigMensCChart(club,tournament,3,18,5)).toBe(false);
    expect(usesUitsigMensCChart(club,tournament,4,16,5)).toBe(false);
    expect(usesUitsigMensCChart(club,tournament,4,18,4)).toBe(false);
  });
  it("leaves the default model unchanged and retains saved games", () => {
    const m = model();
    const before = buildProposedSwissGrid(m);
    m.rounds[1].fixtures = [{ id:"saved",round:2,state:"completed",a:"p1",b:"p2",aLabel:"Player 1",bLabel:"Player 2",winner:"p2",loser:"p1",score:"3-1",when:"2026-10-22 18:00",court:"Court 1",playBy:"2026-10-29" }];
    m.rounds[1].created = true;
    const snapshot = JSON.stringify(m);
    const exact = buildProposedSwissGrid(m, { exactMensCChart:true });
    expect(exact.rounds[1].blocks.map(b => b.rows.map(r => r.pos))).toEqual(expected[1]);
    expect(buildSwissGrid(m)[1].blocks.find(b => b.matchId === "saved")).toMatchObject({ score:"3–1",court:"Court 1",playBy:"2026-10-29" });
    expect(JSON.stringify(m)).toBe(snapshot);
    expect(buildProposedSwissGrid(model())).toEqual(before);
    expect(before.rounds[1].blocks.map(b => b.rows.map(r => r.pos))).not.toEqual(expected[1]);
  });
  it("shows Round 2 1v9 even when a full saved round pairs 1v10", () => {
    const savedRound2 = [[1,10],[2,9],[3,8],[4,7],[5,6],[11,18],[12,17],[13,16],[14,15]];
    const m = buildSwissProgression({
      seedOrder: Array.from({ length: 18 }, (_,i) => `p${i+1}`), names: {}, totalRounds: 5,
      matches: [
        ...expected[0].map(([a,b],i) => ({ id:`r1-${i}`,round:1,a:`p${a}`,b:`p${b}`,winner:`p${a}`,status:"completed",score:"3-1" })),
        ...savedRound2.map(([a,b],i) => ({ id:`r2-${i}`,round:2,a:`p${a}`,b:`p${b}`,winner:null,status:"scheduled",playBy:"2026-10-29" })),
      ],
    });
    const snapshot = JSON.stringify(m);
    const exact = buildProposedSwissGrid(m, { exactMensCChart: true });
    for (let i=0;i<5;i++) expect(exact.rounds[i].blocks.map(b => b.rows.map(r => r.pos))).toEqual(expected[i]);
    expect(exact.rounds[1].blocks[0].rows.map(r => r.id)).toEqual(["p1","p9"]);
    expect(exact.rounds[1].blocks[0].saved).not.toBe(true);
    expect(exact.rounds[1].blocks[0].score).toBeNull();
    expect(buildSwissGrid(m)[1].blocks[0].rows.map(r => r.pos)).toEqual([1,10]);
    expect(JSON.stringify(m)).toBe(snapshot);
    expect(buildProposedSwissGrid(m).rounds[1].blocks[0].rows.map(r => r.pos)).toEqual([1,10]);
  });
});