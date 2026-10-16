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
      // Even fields follow the template exactly; odd fields may move the bye so nobody sits out twice.
      if (n % 2 === 0) expect(rd.blocks.filter((b) => b.rows[1].pos != null).map((b) => b.rows.map((x) => x.pos))).toEqual(categoryTemplate(n,r)[index].pairs.map((p) => [p.a,p.b]));
    });
  });
  it("9 entrants: the 9th seed does not get the bye again in later rounds", () => {
    const grid = buildProposedSwissGrid(modelFor(9, 5));
    const byeSlots = grid.rounds.map((rd) => rd.blocks.find((b) => b.rows[1].name === "Bye")?.rows[0].pos);
    expect(byeSlots[0]).toBe(9);
    expect(byeSlots[1]).not.toBe(9);
  });
  it("copies saved round 1 exactly and shows saved later-round games as real games, without mutating the model", () => {
    const model = modelFor(8,3);
    model.rounds[0] = { round:1, created:true, complete:true, fixtures:[{ id:"saved", round:1, state:"completed", a:"p1", b:"p2", aLabel:"Saved A", bLabel:"Saved B", winner:"p2", loser:"p1", score:"3-1", when:"2026-10-14 18:00", court:"Court 1", playBy:null }] };
    model.rounds[1] = { ...model.rounds[0], round:2, fixtures: model.rounds[0].fixtures.map((f) => ({ ...f, id: "saved-2", round: 2 })) };
    const snapshot = JSON.stringify(model);
    const preview = buildProposedSwissGrid(model);
    const live1 = buildSwissGrid(model)[0];
    expect(preview.rounds[0]).toEqual({ ...live1, blocks: live1.blocks.map((b) => ({ ...b, saved: true })) });
    const real2 = preview.rounds[1].blocks.find((b) => b.matchId === "saved-2")!;
    expect(real2.saved).toBe(true);
    expect(real2.rows.map((r) => r.name).sort()).toEqual(["Saved A", "Saved B"]);
    expect(real2.rows.some((r) => r.projected)).toBe(false);
    expect(JSON.stringify(model)).toBe(snapshot);
  });
  it("unsupported entrant count fails visibly instead of inventing positions", () => {
    expect(buildProposedSwissGrid(modelFor(5,3)).rounds).toEqual([]);
    expect(buildProposedSwissGrid(modelFor(5,3)).issues.length).toBeGreaterThan(0);
  });
});
import { proposedRoundSchedule as prs, buildProposedSwissGrid as bpg, buildSwissProgression as bsp } from "@/lib/tournaments/swiss-progression-view";
describe("proposed round schedule labels", () => {
  const fixed = { rule: "fixed", date: "2026-11-04", roundDates: ["2026-11-04", "2026-11-11", "2026-11-18", "2026-11-25"] };
  it("fixed round dates become a round window, never a per-match booking", () => {
    expect(prs(fixed, 2)).toEqual({ kind: "window", label: expect.stringContaining("Round window: Wed 11 Nov") });
    expect(prs({ ...fixed, timeFrom: "18:00", timeTo: "21:00", courtIds: [20] }, 3, (c) => `C${c}`).label).toContain("18:00–21:00 · C20");
  });
  it("a round beyond the configured dates is Not scheduled (Mens A round 5)", () => {
    expect(prs(fixed, 5)).toEqual({ kind: "none", label: "Not scheduled" });
    expect(prs(null, 2).label).toBe("Not scheduled");
  });
  it("play-by stages show Play by", () => {
    expect(prs({ rule: "play_by", roundDates: [null, "2026-11-12"] }, 2).label).toMatch(/^Play by Thu 12 Nov/);
    expect(prs({ rule: "play_by", deadline: "2026-11-30" }, 3).label).toMatch(/^Play by/);
  });
  it("grid rows carry the round label; saved round 1 stays factual", () => {
    const ids = Array.from({ length: 24 }, (_, i) => `p${i + 1}`);
    const model = bsp({ seedOrder: ids, names: Object.fromEntries(ids.map((i) => [i, i])), totalRounds: 5,
      matches: Array.from({ length: 12 }, (_, k) => ({ id: `m${k}`, round: 1, a: ids[k], b: ids[23 - k], status: "scheduled", date: "2026-10-14", time: "15:00:00", court: "Court 1" })) } as any);
    const { rounds } = bpg(model, { schedule: fixed });
    expect(rounds[0].blocks[0].rows[0].when).toBe("2026-10-14 15:00");
    expect(rounds[0].schedule).toBeUndefined();
    expect(rounds[1].blocks[0].rows[0].when).toContain("Round window");
    expect(rounds[4].blocks.every((b) => b.rows[0].when === "Not scheduled")).toBe(true);
    expect(rounds[1].blocks.every((b) => b.rows.every((r) => r.name === "TBD"))).toBe(true);
  });
});

describe("Read-only projection from confirmed results (Mens A first result)", () => {
  const build = (winner: "p1" | "p24" | null) => {
    const m = buildSwissProgression({
      seedOrder: Array.from({ length: 24 }, (_, i) => `p${i + 1}`), names: { p1: "Willem Pretorius", p24: "Ethan Tshabalala" }, totalRounds: 5,
      matches: Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, round: 1, a: `p${i + 1}`, b: `p${24 - i}`,
        status: i === 0 && winner ? "completed" : "scheduled", winner: i === 0 ? winner : null, score: i === 0 && winner ? "3-11, 11-5, 11-4, 11-5" : null })),
    });
    return { m, snap: JSON.stringify(m), g: buildProposedSwissGrid(m) };
  };
  const row = (g: any, round: number, pos: number) => g.rounds[round - 1].blocks.flatMap((b: any) => b.rows).find((r: any) => r.pos === pos);
  it("1 v 24 decided: winner fills R2 slot 1, loser slot 24, opponents TBD, nothing written", () => {
    const { m, snap, g } = build("p1");
    expect(row(g, 2, 1)).toMatchObject({ id: "p1", name: "Willem Pretorius", projected: true });
    expect(row(g, 2, 24)).toMatchObject({ id: "p24", name: "Ethan Tshabalala", projected: true });
    expect(row(g, 2, 12)).toMatchObject({ id: null, name: "TBD" });
    expect(row(g, 2, 13)).toMatchObject({ id: null, name: "TBD" });
    expect(g.rounds[2].blocks.flatMap((b: any) => b.rows).every((r: any) => r.id === null)).toBe(true);
    expect(JSON.stringify(m)).toBe(snap);
  });
  it("upset: loser seed 1 drops to slot 24", () => {
    const { g } = build("p24");
    expect(row(g, 2, 1).id).toBe("p24"); expect(row(g, 2, 24).id).toBe("p1");
  });
  it("pending match projects nothing", () => {
    expect(build(null).g.rounds[1].blocks.flatMap((b: any) => b.rows).every((r: any) => r.id === null)).toBe(true);
  });
  it("Result column shows games won only (3–1), never per-game points", () => {
    expect(build("p1").g.rounds[0].blocks.find((b: any) => b.matchId === "m0")!.score).toBe("3–1");
  });
});

describe("saved later-round games are real, not projected", () => {
  it("round 2 saved results show players, W/L and score without the projected tag", async () => {
    const { buildSwissProgression, buildProposedSwissGrid } = await import("@/lib/tournaments/swiss-progression-view");
    const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    const names = Object.fromEntries(ids.map((id) => [id, id.toUpperCase()]));
    const r1 = [[1, 8], [2, 7], [3, 6], [4, 5]].map(([a, b], i) => ({ id: `r1-${i}`, round: 1, a: `p${a}`, b: `p${b}`, winner: `p${a}`, status: "completed", score: "3-0" }));
    const r2 = [{ id: "r2-0", round: 2, a: "p1", b: "p2", winner: "p2", status: "completed", score: "3-1" }];
    const model = buildSwissProgression({ seedOrder: ids, names, totalRounds: 3, matches: [...r1, ...r2] });
    const grid = buildProposedSwissGrid(model);
    const round2 = grid.rounds.find((r) => r.round === 2)!;
    const real = round2.blocks.find((b) => b.matchId === "r2-0")!;
    expect(real.saved).toBe(true);
    expect(real.rows.map((r) => r.result).sort()).toEqual(["L", "W"]);
    expect(real.rows.some((r) => r.projected)).toBe(false);
    expect(real.score).toBe("3–1");
    // the two players of the saved game appear only once in that round
    const appearances = round2.blocks.flatMap((b) => b.rows.map((r) => r.id)).filter((id) => id === "p1" || id === "p2");
    expect(appearances).toHaveLength(2);
  });
});
