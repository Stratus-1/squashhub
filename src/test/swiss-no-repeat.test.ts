import { describe, expect, it } from "vitest";
import { strictSwissPlan, opponentKey, preferredSwissTemplate } from "@/lib/tournaments/swiss-no-repeat";
import { fixedPositionRound } from "@/lib/tournaments/engine-service";
import { buildSwissProgression, buildProposedSwissGrid } from "@/lib/tournaments/swiss-progression-view";

describe("Shared Swiss no-repeat formula", () => {
  it("24-player round three has the approved six-position gap in each half", () => {
    expect(preferredSwissTemplate(24, 3).pairs.map(p => [p.a, p.b])).toEqual([
      [1, 7], [2, 8], [3, 9], [4, 10], [5, 11], [6, 12],
      [13, 19], [14, 20], [15, 21], [16, 22], [17, 23], [18, 24],
    ]);
  });
  it("round four keeps the top six apart and both halves separate", () => {
    const plan = strictSwissPlan({ occupants: Array.from({ length: 24 }, (_, i) => `p${i + 1}`), round: 4, history: [] });
    expect(plan.ready).toBe(true);
    expect(plan.pairs.map(p => [p.a, p.b])).toEqual([
      [1, 8], [2, 9], [3, 10], [4, 11], [5, 12], [6, 7],
      [13, 20], [14, 21], [15, 22], [16, 23], [17, 24], [18, 19],
    ]);
  });
  it("rematch repair stays inside each half and separates its top six in round three", () => {
    const plan = strictSwissPlan({ occupants: Array.from({ length: 24 }, (_, i) => `p${i + 1}`), round: 3,
      history: [{ a: "p1", b: "p7", round: 2 }] });
    expect(plan.ready).toBe(true);
    expect(plan.pairs.some(p => p.a === 1 && p.b === 7)).toBe(false);
    expect(plan.pairs.every(p => Math.floor((p.a - 1) / 12) === Math.floor((p.b - 1) / 12)
      && Math.floor((p.a - 1) / 6) !== Math.floor((p.b - 1) / 6))).toBe(true);
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