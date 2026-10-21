import { describe, expect, it } from "vitest";
import { rrFinishIssues, rrFinishRound, rrFinishSplit, rrFinishRepeats } from "@/lib/tournaments/swiss-rr-finish";
import { nextSwissRound, type SpecDivision } from "@/lib/tournaments/engine-service";
import { syncSwissRoundsToSpec } from "@/lib/smart-builder/sync-live-rounds";
import { buildProposedSwissGrid, buildSwissProgression } from "@/lib/tournaments/swiss-progression-view";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const key = (a: string, b: string) => [a, b].sort().join("|");

describe("round robin in the final 3 rounds — feasibility", () => {
  it("18 players, 3 groups: 1–4, 5–8, 9–12 round robin; 13–18 carry on Swiss", () => {
    expect(rrFinishIssues(18, 5, 3)).toEqual([]);
    expect(rrFinishSplit(18, 3)).toEqual({ groupRanges: [[1, 4], [5, 8], [9, 12]], remainder: [13, 18] });
  });
  it("needs exactly 5 rounds, enough players, and never leaves one player alone", () => {
    expect(rrFinishIssues(18, 5, 1.5)).toContain("Choose at least one group of 4.");
    expect(rrFinishIssues(18, 4, 3)[0]).toMatch(/exactly 5/);
    expect(rrFinishIssues(10, 5, 3)[0]).toMatch(/need 12 players/);
    expect(rrFinishIssues(13, 5, 3).join()).toMatch(/one player on their own/);
    expect(rrFinishIssues(16, 5, 4)).toEqual([]);
    expect(rrFinishIssues(18, 5, 4).join()).toMatch(/too few Swiss players/);
    expect(rrFinishIssues(15, 5, 3).join()).toMatch(/too few Swiss players/);
  });
});

describe("fixed group pairings", () => {
  it("each group of 4 plays everyone exactly once over Rounds 3–5", () => {
    const snap = ids(18);
    const seen = new Map<string, number>();
    for (const r of [3, 4, 5]) {
      const { pairs, remainder } = rrFinishRound(snap, r, 3);
      expect(pairs).toHaveLength(6);
      expect(remainder).toEqual(snap.slice(12));
      pairs.forEach(([a, b]) => seen.set(key(a, b), (seen.get(key(a, b)) ?? 0) + 1));
    }
    expect(seen.size).toBe(18); // 3 groups × 6 pairs
    expect([...seen.values()].every((v) => v === 1)).toBe(true);
    expect(rrFinishRound(snap, 3, 3).pairs[0]).toEqual(["p1", "p4"]);
  });
  it("flags group games that repeat a Round 1–2 game", () => {
    expect(rrFinishRepeats(ids(8), 2, [["p1", "p2"], ["p5", "p6"], ["p3", null]])).toEqual([
      { round: 5, a: "p1", b: "p2" }, { round: 5, a: "p5", b: "p6" },
    ]);
  });
});

// Engine: an 18-player division with Rounds 1–2 played; toggle on vs off.
const div = (rrFinish?: { enabled: boolean; groups: number }): SpecDivision => ({
  divisionId: "d", label: "Mens B · Singles", unit: "single", seeding: "manual",
  entrants: ids(18).map((id, i) => ({ id, rank: i + 1 })),
  stages: [{ id: "s", order: 0, kind: "swiss", name: "Swiss", swissRounds: 5, ...(rrFinish ? { rrFinish } : {}) }],
} as any);
const fx = (round: number, a: string, b: string | null, winner: string | null) => ({ divisionId: "d", stageId: "s", round, a, b, winner, status: "completed" } as any);
const played = [
  ...Array.from({ length: 9 }, (_, i) => fx(1, `p${i + 1}`, `p${i + 10}`, `p${i + 1}`)),
  ...Array.from({ length: 9 }, (_, i) => fx(2, `p${i + 1}`, `p${18 - i}`, `p${i + 1}`)).filter((f) => f.a !== f.b),
];

describe("engine with the option", () => {
  it.each([[18, 3], [16, 4]])("source projection and generation agree through R3–5 for %i players/%i groups", (n, groups) => {
    const d = div({ enabled: true, groups });
    d.entrants = ids(n).map((id, i) => ({ id, rank: i + 1 }));
    d.stages[0].tieBreaks = ["position_swap"];
    const r2 = n === 18 ? [[1,9],[2,8],[3,7],[4,6],[5,10],[11,18],[12,17],[13,16],[14,15]]
      : [[1,8],[2,7],[3,6],[4,5],[9,16],[10,15],[11,14],[12,13]];
    const rows = [...Array.from({ length: n / 2 }, (_, i) => fx(1, `p${i + 1}`, `p${n - i}`, `p${i + 1}`)),
      ...r2.map(([a,b]) => fx(2, `p${a}`, `p${b}`, `p${a}`))];
    const remainder = new Set(ids(n).slice(groups * 4));
    const seen = new Set(rows.map((r) => key(r.a, r.b)));
    for (const round of [3,4,5]) {
      const model = buildSwissProgression({ seedOrder: ids(n), names: {}, totalRounds: 5, tieBreaks: ["position_swap"], matches: rows.map((r,i) => ({ ...r, id: `row-${i}` })) });
      model.rrFinish = { enabled: true, groups };
      const projected = buildProposedSwissGrid(model).rounds.find((r) => r.round === round)?.blocks
        .filter((b) => b.rows.every((r) => r.id)).map((b) => key(String(b.rows[0].id), String(b.rows[1].id))).sort();
      const generated = nextSwissRound("synthetic", d, "s", rows);
      expect(generated).toHaveLength(n / 2);
      expect(new Set(generated.flatMap((g) => [g.a,g.b])).size).toBe(n);
      expect(generated.map((g) => key(String(g.a),String(g.b))).sort()).toEqual(projected);
      for (const game of generated) {
        const pair = key(String(game.a),String(game.b));
        expect(seen.has(pair)).toBe(false);
        seen.add(pair);
        // Swiss remainder standings change with upsets; subsequent pairings recompute.
        rows.push(fx(round, String(game.a), game.b, remainder.has(String(game.a)) ? game.b : game.a));
      }
    }
  });
  it("Round 3 with groups: 6 group games + 3 Swiss games among positions 13–18, no repeats outside groups", () => {
    const rows = [...Array.from({ length: 9 }, (_, i) => fx(1, `p${2 * i + 1}`, `p${2 * i + 2}`, `p${2 * i + 1}`)),
      ...[[1, 3], [5, 7], [9, 11], [13, 15], [17, 2], [4, 6], [8, 10], [12, 14], [16, 18]].map(([a, b]) => fx(2, `p${a}`, `p${b}`, `p${a}`))];
    const out = nextSwissRound("t", div({ enabled: true, groups: 3 }), "s", rows);
    expect(out).toHaveLength(9);
    expect(out.every((f) => f.round === 3)).toBe(true);
    const earlier = new Set(rows.map((r) => key(r.a, r.b)));
    out.slice(6).forEach((f) => expect(earlier.has(key(f.a!, f.b!))).toBe(false));
    const groupIds = new Set(out.slice(0, 6).flatMap((f) => [f.a, f.b]));
    expect(groupIds.size).toBe(12);
  });
  it("toggle off keeps the normal Swiss pairing", () => {
    const off = nextSwissRound("t", div(), "s", played);
    const on = nextSwissRound("t", div({ enabled: false, groups: 3 }), "s", played);
    expect(on).toEqual(off);
  });
});

describe("Structure value is the one the running tournament uses (Riverside)", () => {
  const spec = { divisions: [{ label: "Mens B · Singles", groupNumber: 2, stages: [{ order: 0, kind: "swiss", swissRounds: 5 }] }] };
  it("a category inheriting the tournament default (4) is synced, not left at 5", () => {
    const r = syncSwissRoundsToSpec(spec, { format: { kind: "swiss", swissRounds: "4", swissRoundsConfirmed: "4" } }, { 2: 1 });
    expect(r.spec.divisions[0].stages[0].swissRounds).toBe(4);
  });
  it("carries the round robin option, and refuses to change it once Round 3 has games", () => {
    const answers = { stagePlans: { "Mens B": [{ id: "a", kind: "swiss" as const, rounds: 5, rrFinish: { enabled: true, groups: 3 } }] } };
    expect(syncSwissRoundsToSpec(spec, answers, { 2: 2 }).spec.divisions[0].stages[0].rrFinish).toEqual({ enabled: true, groups: 3 });
    const late = syncSwissRoundsToSpec(spec, answers, { 2: 3 });
    expect(late.spec.divisions[0].stages[0].rrFinish).toBeUndefined();
    expect(late.blocked[0]).toMatch(/Round 3 already has games/);
  });
});
