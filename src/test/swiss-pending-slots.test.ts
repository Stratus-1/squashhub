import { describe, expect, it } from "vitest";
import { pendingSwissSlots } from "@/lib/tournaments/swiss-pending-slots";
import { buildSwissProgression, buildProposedSwissGrid, type ProgressionMatchInput } from "@/lib/tournaments/swiss-progression-view";
import { prospectiveSwissPolicy } from "@/lib/tournaments/swiss-sequencing-policy";
import { swissOpponentKey } from "@/lib/tournaments/swiss-sequencing";

const seeds = Array.from({ length: 18 }, (_, i) => `p${i + 1}`);
const game = (round: number, a: string, b: string | null, winner = a): ProgressionMatchInput => ({ id: `${round}-${a}`, a, b, round, winner, status: "completed", score: "15-0,15-0,15-0" });
const opening = [
  ...Array.from({ length: 9 }, (_, i) => game(1, seeds[i], seeds[i + 9])),
  ...[[1,9],[2,8],[3,7],[4,6],[5,10],[11,18],[12,17],[13,16],[14,15]].map(([a,b]) => game(2, `p${a}`, `p${b}`)),
];
const opts = { factualOpeningRounds: true, finalSwissAdjacencyPreview: true };
const model = (matches: ProgressionMatchInput[], groups = 2) => buildSwissProgression({ seedOrder: seeds, names: Object.fromEntries(seeds.map((id) => [id, id])), matches, totalRounds: 5, tieBreaks: ["position_swap"], rrFinish: { enabled: true, groups } });

describe("Swiss positional preview slots", () => {
  it("Riverside bottom ten have exactly five R5 pairs, with no player identities or scores", () => {
    const m = model(opening), before = JSON.stringify(m);
    const grid = buildProposedSwissGrid(m, opts);
    const rest = grid.rounds[4].blocks.filter((b) => (b.rows[0].pos ?? 0) >= 9);
    expect(rest).toHaveLength(5);
    expect(rest.map((b) => b.rows.map((r) => r.pos))).toEqual([[9,10],[11,12],[13,14],[15,16],[17,18]]);
    expect(rest.every((b) => b.score === null && b.rows.every((r) => r.id === null && r.projected && r.result === ""))).toBe(true);
    expect(grid.rounds[4].blocks).toHaveLength(9);
    expect(JSON.stringify(m)).toBe(before);
  });
  it.each([2,3])("%i RR groups keep their fixed pairings while every unresolved Swiss position occurs once", (groups) => {
    const m = model(opening, groups);
    const legacy = buildProposedSwissGrid(m);
    const fixed = buildProposedSwissGrid(m, opts);
    for (const i of [3,4]) {
      expect(fixed.rounds[i].blocks).toHaveLength(9);
      const rr = (b: typeof fixed.rounds[number]["blocks"][number]) => (b.rows[0].pos ?? 99) <= groups * 4;
      expect(fixed.rounds[i].blocks.filter(rr)).toEqual(legacy.rounds[i].blocks.filter(rr));
      expect(fixed.rounds[i].blocks.flatMap((b) => b.rows.map((r) => r.pos)).sort((a,b) => Number(a)-Number(b))).toEqual(Array.from({length:18},(_,i)=>i+1));
    }
  });
  it("R3/R4 saved scores remain factual; completed R4 resolves five current-rank non-repeat R5 matches", () => {
    const matches = [...opening];
    for (const round of [3,4]) {
      const blocks = buildProposedSwissGrid(model(matches), opts).rounds[round-1].blocks;
      expect(blocks).toHaveLength(9);
      for (const [i,b] of blocks.entries()) {
        const [a,c] = b.rows.map((r) => r.id);
        if (!a || !c) throw new Error("Expected resolved next round");
        matches.push(game(round,a,c,i%2 ? c : a));
      }
    }
    const grid = buildProposedSwissGrid(model(matches), opts);
    for (const round of [3,4]) {
      expect(grid.rounds[round-1].blocks).toHaveLength(9);
      expect(grid.rounds[round-1].blocks.every((b) => b.saved && b.score === "3–0")).toBe(true);
    }
    const rest = grid.rounds[4].blocks.filter((b) => (b.rows[0].pos ?? 0) >= 9);
    expect(rest).toHaveLength(5);
    const met = new Set(matches.flatMap((m) => m.a && m.b ? [swissOpponentKey(m.a,m.b)] : []));
    for (const b of rest) {
      const [a,c] = b.rows.map((r) => r.id);
      if (!a || !c) throw new Error("Expected final names");
      expect(met.has(swissOpponentKey(a,c))).toBe(false);
    }
    expect(new Set(rest.flatMap((b) => b.rows.map((r) => r.id))).size).toBe(10);
    expect(grid.warnings?.length).toBeGreaterThan(0);
  });
  it.each([11,12])("prospective full Swiss %i players has ceil(n/2) pending blocks, no singleton fake opponents", (n) => {
    const tournamentId = "new-test";
    const m = buildSwissProgression({ seedOrder: seeds.slice(0,n), names:{}, matches:[], totalRounds:5, tournamentId, swissSequencing: prospectiveSwissPolicy(tournamentId,"2026-10-23") });
    const blocks = buildProposedSwissGrid(m).rounds[4].blocks;
    expect(blocks).toHaveLength(Math.ceil(n/2));
    expect(blocks.flatMap((b) => b.rows.map((r) => r.pos)).filter((p) => p !== null)).toEqual(Array.from({length:n},(_,i)=>i+1));
    expect(blocks.flatMap((b) => b.rows).filter((r) => r.pos === null)).toHaveLength(n%2);
  });
  it("partial saved R5 is retained without copying earlier results into waits", () => {
    const m = model([...opening, game(5,"p11","p18")]);
    const grid = buildProposedSwissGrid(m, opts);
    const saved = grid.rounds[4].blocks.find((b) => b.matchId === "5-p11");
    expect(saved?.saved).toBe(true);
    expect(saved?.score).toBe("3–0");
    expect(grid.rounds[4].blocks.filter((b) => !b.saved).every((b) => b.score === null)).toBe(true);
  });
  it("slot helper does not change the supplied positions", () => {
    const positions=[11,9,10];
    expect(pendingSwissSlots(5,positions,"Not scheduled",null).map((b)=>b.rows.map((r)=>r.pos))).toEqual([[9,10],[11,null]]);
    expect(positions).toEqual([11,9,10]);
  });
});