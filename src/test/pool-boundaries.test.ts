import { describe, it, expect } from "vitest";
import { buildDrawSpec, previewDraw, unitId, unitsFor, withEntrants, type DivFormat, type DrawDivision, type RegLite } from "@/lib/smart-builder/step-draw";
import { generateFromSpec } from "@/lib/tournaments/engine-service";
import { poolAssignmentIssues, poolFixtureIssues, rrGames } from "@/lib/tournaments/pool-boundaries";
import { rankPoolTally } from "@/lib/tournaments/contract";
import { buildPlayoffChain } from "@/lib/smart-builder/playoff-chain";

const regs: RegLite[] = Array.from({ length: 9 }, (_, i) => ({ club_member_id: `p${i + 1}`, partner_member_id: null, status: "confirmed", division_choices: [1] }));
const fmt: DivFormat = { kind: "pools", pools: 2, swissRounds: 0, seeding: "entry_order", schedule: { rule: "play_by", deadlines: ["2026-11-30"], upto: [], dates: [] }, crossGroups: [] };
const div = (manualPools?: string[][]): DrawDivision[] => [{ group: 1, label: "Men's A", doubles: false, units: unitsFor(regs, 1, 1, false).units, format: fmt, notes: [], playoffs: [], manualPools } as DrawDivision];

describe("pool round robin boundaries", () => {
  it("two unequal pools (5 + 4): no cross-pool fixtures, per-pool counts 10 + 6", () => {
    const d = div();
    const fx = generateFromSpec(withEntrants(buildDrawSpec("T", d, "v1"), d), "t");
    const spec = buildDrawSpec("T", d, "v1");
    const pools = (spec.divisions[0] as any).stages[0].poolMembers as string[][];
    expect(pools.map((p) => p.length).sort()).toEqual([4, 5]);
    const poolOf = new Map(pools.flatMap((p, i) => p.map((id) => [id, i] as const)));
    for (const f of fx) expect(poolOf.get(f.a!)).toBe(poolOf.get(f.b!));
    expect(fx).toHaveLength(rrGames(5) + rrGames(4));
    expect(new Set(fx.map((f) => f.poolId)).size).toBe(2);
  });
  it("detects cross-pool pairings and wrong counts", () => {
    const pools = [["a", "b", "c"], ["d", "e"]];
    const ok = [["a", "b"], ["a", "c"], ["b", "c"], ["d", "e"]].map(([a, b]) => ({ a, b, poolIndex: null }));
    expect(poolFixtureIssues(pools, ok)).toEqual([]);
    const bad = poolFixtureIssues(pools, [...ok.slice(0, 3), { a: "a", b: "d", poolIndex: null }]);
    expect(bad.join()).toMatch(/different pools/);
    expect(bad.join()).toMatch(/Pool B \(2\) has 0 games, expected 1/);
  });
  it("standings positions are independent per pool", () => {
    const a = rankPoolTally(new Map([["a1", 3], ["a2", 1], ["a3", 0]]), 2, "Pool A");
    const b = rankPoolTally(new Map([["b1", 2], ["b2", 0]]), 2, "Pool B");
    expect(a[0]).toBe("a1"); expect(b[0]).toBe("b1"); // both are #1 of their own pool
  });
  it("play-offs resolve from pool positions: A1 v B2, B1 v A2", () => {
    const plan = { pairing: "crossover", mode: "scheduled", date: "2026-11-02", deadline: null, from: null, to: null, courtIds: [], trigger: "confirm" } as any;
    const main = { id: "v-main", order: 0, kind: "pools", pools: 2, poolMembers: [["a1", "a2", "a3", "a4", "a5"], ["b1", "b2", "b3", "b4"]] } as any;
    const r = buildPlayoffChain(main, "v", [{ name: "SF", plan }, { name: "F", plan: { ...plan, pairing: "winners" } }], { qualifiers: { perPool: 2, runnersUp: 0 } });
    expect(r.reason).toBeNull();
    expect(r.stages[0].mapping!.matches.map((x) => `${x.a}v${x.b}`).sort()).toEqual(["A1vB2", "B1vA2"]);
  });
  it("blocks generation for unresolved, duplicated or missing pool assignments", () => {
    const ids = div()[0].units.map(unitId);
    expect(poolAssignmentIssues(null, ids)[0]).toMatch(/not resolved/);
    expect(poolAssignmentIssues([ids.slice(0, 5), [ids[0], ...ids.slice(5)]], ids).join()).toMatch(/both Pool A and Pool B/);
    expect(poolAssignmentIssues([ids.slice(0, 4), ids.slice(5)], ids).join()).toMatch(/not in any pool/);
    const p = previewDraw("T", div([ids.slice(0, 5), [ids[0], ...ids.slice(5)]]), { start: null, end: null });
    expect(p.errors.join()).toMatch(/exactly one pool/);
  });
});
