import { describe, expect, it } from "vitest";
import { strictSwissPlan, opponentKey, preferredSwissTemplate } from "@/lib/tournaments/swiss-no-repeat";
import { fixedPositionRound } from "@/lib/tournaments/engine-service";
import { buildSwissProgression, buildProposedSwissGrid } from "@/lib/tournaments/swiss-progression-view";

describe("Shared Swiss no-repeat formula", () => {
  it("24-player round three uses groups of 6 in each half", () => {
    expect(preferredSwissTemplate(24, 3).pairs.map(p => [p.a, p.b])).toEqual([[1,6],[2,5],[3,4],[7,12],[8,11],[9,10],[13,18],[14,17],[15,16],[19,24],[20,23],[21,22]]);
  });
  it("round four uses 1v3 sliding model and keeps halves separate", () => {
    const plan = strictSwissPlan({ occupants: Array.from({ length: 24 }, (_, i) => `p${i + 1}`), round: 4, history: [] });
    expect(plan.ready).toBe(true);
    expect(plan.pairs.map(p => [p.a, p.b])).toEqual([[1,3],[2,4],[5,7],[6,8],[9,11],[10,12],[13,15],[14,16],[17,19],[18,20],[21,23],[22,24]]);
  });
  it("rematch repair stays inside each half in round three", () => {
    const plan = strictSwissPlan({ occupants: Array.from({ length: 24 }, (_, i) => `p${i + 1}`), round: 3,
      history: [{ a: "p1", b: "p6", round: 2 }] });
    expect(plan.ready).toBe(true);
    expect(plan.pairs.some(p => p.a === 1 && p.b === 6)).toBe(false);
    expect(plan.pairs.every(p => Math.floor((p.a - 1) / 12) === Math.floor((p.b - 1) / 12))).toBe(true);
    expect(new Set(plan.pairs.flatMap(p => [p.a, p.b])).size).toBe(24);
  });
  it.each([18, 24])("%i players with changing positions have no repeat in five rounds", (n) => {
    const d = { divisionId: "d", entrants: Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })) } as any;
    const rows: any[] = [];
    const seen = new Set<string>();
    for (let round = 1; round <= 5; round++) {
      const pairs = fixedPositionRound(d, rows, round);
      expect(pairs).not.toBeNull();
      if (!pairs) return;
      pairs.forEach(([a, b], i) => {
        if (!b) return;
        expect(seen.has(opponentKey(a, b))).toBe(false);
        seen.add(opponentKey(a, b));
        rows.push({ a, b, round, winner: (round + i) % 2 ? a : b, status: "completed" });
      });
    }
    expect(seen.size).toBe(n / 2 * 5);
  });
  it("24 players play five rounds without repeated opponents, preserving rounds 1 and 2", () => {
    const d = { divisionId: "d", entrants: Array.from({ length: 24 }, (_, i) => ({ id: `p${i + 1}` })) } as any;
    const rows: any[] = [];
    const seen = new Set<string>();
    for (let round = 1; round <= 5; round++) {
      const pairs = fixedPositionRound(d, rows, round);
      expect(pairs).not.toBeNull();
      if (!pairs) return;
      if (round <= 2) expect(pairs).toEqual(fixedPositionRound(d, rows, round, false));
      expect(new Set(pairs.flat().filter(Boolean)).size).toBe(24);
      for (const [a, b] of pairs) {
        if (!b) continue;
        expect(seen.has(opponentKey(a, b))).toBe(false);
        seen.add(opponentKey(a, b));
        rows.push({ round, a, b, winner: a, status: "completed" });
      }
    }
    expect(seen.size).toBe(60);
  });
  it("repairs positions 3 and 7 when their actual players have already met", () => {
    const occupants = Array.from({ length: 24 }, (_, i) => `p${i + 1}`);
    const plan = strictSwissPlan({ occupants, round: 4, history: [{ round: 3, a: "p3", b: "p7" }] });
    expect(plan.ready).toBe(true);
    expect(plan.pairs.some((p) => p.a === 3 && p.b === 7)).toBe(false);
    expect(new Set(plan.pairs.flatMap((p) => [p.a, p.b])).size).toBe(24);
  });
  it("projection and generation agree through five rounds with mixed winners and preserved saved rounds", () => {
    const ids = Array.from({ length: 24 }, (_, i) => `p${i + 1}`);
    const d = { divisionId: "d", entrants: ids.map((id) => ({ id })) } as any;
    const rows: any[] = [];
    const seen = new Set<string>();
    for (let round = 1; round <= 5; round++) {
      const snapshot = JSON.stringify(rows);
      const model = buildSwissProgression({ seedOrder: ids, names: {}, totalRounds: 5,
        matches: rows.map((f, i) => ({ id: `m${i}`, a: f.a, b: f.b, round: f.round, winner: f.winner, status: "completed" })) });
      const grid = buildProposedSwissGrid(model);
      expect(grid.issues).toEqual([]);
      const projected = grid.rounds[round - 1].blocks.map((b) => b.rows.map((r) => r.id));
      const pairs = fixedPositionRound(d, rows, round);
      expect(pairs).toEqual(projected);
      expect(JSON.stringify(rows)).toBe(snapshot);
      if (!pairs) return;
      pairs.forEach(([a, b], i) => {
        if (!b) return;
        expect(seen.has(opponentKey(a, b))).toBe(false);
        seen.add(opponentKey(a, b));
        rows.push({ a, b, round, winner: (i + round) % 3 ? a : b, status: "completed" });
      });
    }
    expect(seen.size).toBe(60);
  });
  it("keeps confirmed games unchanged while repairing unsaved pairings", () => {
    const occupants = Array.from({ length: 24 }, (_, i) => `p${i + 1}`);
    const plan = strictSwissPlan({ occupants, round: 3, history: [], locked: [{ a: "p1", b: "p8" }] });
    expect(plan.pairs).toContainEqual({ a: 1, b: 8 });
    expect(new Set(plan.pairs.flatMap((p) => [p.a, p.b])).size).toBe(24);
  });
  it("preserves partial saved round 2 games even when they differ from the template", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    const matches = [[1, 8], [2, 7], [3, 6], [4, 5]].map(([a, b], i) => ({ id: `r1-${i}`, a: `p${a}`, b: `p${b}`, round: 1, winner: `p${a}`, status: "completed" }));
    matches.push({ id: "r2-saved", a: "p1", b: "p2", round: 2, winner: "p2", status: "completed" });
    const model = buildSwissProgression({ seedOrder: ids, names: {}, totalRounds: 3, matches });
    const snapshot = JSON.stringify(model);
    const grid = buildProposedSwissGrid(model);
    expect(grid.rounds[1].blocks.find((b) => b.matchId === "r2-saved")?.saved).toBe(true);
    expect(grid.rounds[1].blocks.flatMap((b) => b.rows).filter((r) => r.id === "p1" || r.id === "p2")).toHaveLength(2);
    expect(JSON.stringify(model)).toBe(snapshot);
  });
  it("stops instead of silently repeating when no legal pairing exists", () => {
    const occupants = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    const history = occupants.slice(1).map((b) => ({ a: "p1", b, round: 1 }));
    const plan = strictSwissPlan({ occupants, round: 3, history });
    expect(plan.ready).toBe(false);
    expect(plan.issue).toMatch(/no pairing without repeat/);
  });
});
describe("uneven Swiss halves", () => {
  it("18 players split 10 top / 8 bottom from round 3", async () => {
    const { swissHalves, preferredSwissTemplate } = await import("@/lib/tournaments/swiss-no-repeat");
    expect(swissHalves(18)).toEqual([10, 8]);
    expect(swissHalves(24)).toEqual([12, 12]);
    const pairs = preferredSwissTemplate(18, 3).pairs.map(p => [p.a, p.b]);
    expect(pairs).toEqual([[1,5],[2,6],[3,7],[4,8],[9,10],[11,14],[12,13],[15,18],[16,17]]);
  });
});

describe("24-player round gaps", () => {
  it("approved model: R3 1v6, R4 1v3, R5 1v2 and no position pair repeats", () => {
    const r = (n: number) => preferredSwissTemplate(24, n).pairs.map(p => `${p.a}-${p.b}`);
    expect(r(3).slice(0, 3)).toEqual(["1-6", "2-5", "3-4"]);
    expect(r(4).slice(0, 4)).toEqual(["1-3", "2-4", "5-7", "6-8"]);
    expect(r(5).slice(0, 6)).toEqual(["1-2", "3-5", "4-6", "7-8", "9-12", "10-11"]);
    const r2 = Array.from({ length: 6 }, (_, i) => `${i + 1}-${12 - i}`);
    const all = [...r2, ...[3, 4, 5].flatMap(r)];
    expect(new Set(all).size).toBe(all.length);
  });
});

import { preferredSwissTemplate as pst18, swissStrictFromRound as sfr18 } from "@/lib/tournaments/swiss-no-repeat";
describe("18-player 10/8 split from round 2", () => {
  it("starts strict at round 2 only for uneven halves", () => {
    expect(sfr18(18)).toBe(2);
    expect(sfr18(24)).toBe(3);
  });
  it("round 2 pairs within top 10 and bottom 8", () => {
    const pairs = pst18(18, 2).pairs.map((p) => [p.a, p.b]);
    expect(pairs).toEqual([[1,10],[2,9],[3,8],[4,7],[5,6],[11,18],[12,17],[13,16],[14,15]]);
  });
});

describe("18-player approved model", () => {
  it("R4 and R5 follow the saved model with no position repeats", () => {
    const r = (n: number) => pst18(18, n).pairs.map((p) => `${p.a}-${p.b}`);
    expect(r(4)).toEqual(["1-3","2-4","5-7","6-9","8-10","11-13","12-14","15-17","16-18"]);
    expect(r(5)).toEqual(["1-2","3-4","5-8","6-10","7-9","11-12","13-14","15-16","17-18"]);
    const all = [2, 3, 4, 5].flatMap(r);
    expect(new Set(all).size).toBe(all.length);
  });
});
