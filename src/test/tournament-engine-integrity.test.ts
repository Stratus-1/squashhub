import { describe, it, expect } from "vitest";
import {
  assertKnockoutShape, assertNoReentry, assertScheduleWithin, assertSeedsUnchanged, assertStageKinds,
  canGenerateStage, contractIssues, mapQualifiers, planRebuild, roundRobin, snakePools, swissRound,
  tournamentMap, isDecided, type DivisionContract, type FixtureRow, type PlannedStage, type PoolStanding,
} from "@/lib/tournaments/contract";

const rrRows = (div: string, stage: string, ids: string[]): FixtureRow[] =>
  roundRobin(ids).map((m, i) => ({ id: `${stage}-${i}`, divisionId: div, stageId: stage, stageKind: "round_robin", round: m.round, a: m.a, b: m.b }));
const ids = (n: number, p = "p") => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
const poolsStage: PlannedStage = { id: "pools", order: 0, kind: "pools", name: "Pools", pools: 8, poolSize: 6, schedule: { rule: "fixed", date: "2026-10-03" } };
const koStage: PlannedStage = { id: "ko", order: 1, kind: "knockout", name: "Knockout", drawSize: 16, qualify: { perPool: 2, mapping: "cross_pool" }, generation: "owner_approval", schedule: { rule: "play_by", deadline: "2026-10-31" } };

describe("tournament engine integrity", () => {
  it("1. 10-player RR after 2 withdrawals rebuilds from current roster, keeps played results", () => {
    const all = ids(10);
    const existing = rrRows("d", "rr", all);
    const pi = existing.findIndex((f) => !["p9", "p10"].includes(f.a!) && !["p9", "p10"].includes(f.b!));
    existing[pi] = { ...existing[pi], status: "completed", winner: existing[pi].a, score: "3-0" };
    const withdrawn = new Set(["p9", "p10"]);
    const active = all.filter((x) => !withdrawn.has(x));
    const plan = planRebuild({ divisionId: "d", configuredRounds: null, activeEntrantIds: active, existing, generate: (i) => rrRows("d", "rr", i) });
    expect(plan.keep).toHaveLength(1);
    expect(plan.create.every((f) => !withdrawn.has(f.a!) && !withdrawn.has(f.b!))).toBe(true);
    // 8 players → 28 pairs, one already played
    expect(plan.create).toHaveLength(27);
  });

  it("2. pools -> knockout can never produce RR playoff fixtures", () => {
    const bad: FixtureRow[] = [
      { divisionId: "d", stageId: "ko", stageKind: "knockout", round: 1, a: "x", b: "y" },
      { divisionId: "d", stageId: "ko", stageKind: "knockout", round: 1, a: "x", b: "z" },
    ];
    expect(() => assertKnockoutShape(bad)).toThrow(/twice/);
    expect(() => assertStageKinds([poolsStage, koStage], [{ ...bad[0], stageKind: "round_robin" }])).toThrow(/cannot produce/);
  });

  it("3. multi-division tournaments stay isolated", () => {
    const st: PoolStanding[] = [{ pool: 1, position: 1, id: "a", divisionId: "men" }, { pool: 1, position: 1, id: "b", divisionId: "ladies" }];
    expect(() => mapQualifiers(st, { divisionId: "men", perPool: 1, mapping: "cross_pool" })).toThrow(/another division/);
    const existing = [...rrRows("men", "rr", ids(4, "m")), ...rrRows("ladies", "rr", ids(4, "l"))];
    const plan = planRebuild({ divisionId: "men", configuredRounds: null, activeEntrantIds: ids(3, "m"), existing, generate: (i) => rrRows("men", "rr", i) });
    expect(plan.removeIds.every((id) => existing.find((f) => f.id === id)!.divisionId === "men")).toBe(true);
  });

  it("4. 40-player Swiss: fixed 5 rounds, no repeat opponents", () => {
    const players = ids(40).map((id, i) => ({ id, points: 0, seed: i + 1 }));
    const played = new Set<string>();
    const k = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const ROUNDS = 5;
    for (let r = 0; r < ROUNDS; r++) {
      const pairs = swissRound(players, played);
      expect(pairs).toHaveLength(20);
      for (const [a, b] of pairs) {
        expect(played.has(k(a, b!))).toBe(false);
        played.add(k(a, b!));
        players.find((p) => p.id === (a < b! ? a : b!))!.points += 1;
      }
    }
    expect(played.size).toBe(ROUNDS * 20);
  });

  it("5. 48 seeded players -> 8x6 pools -> top 2 -> deterministic R16", () => {
    const e = ids(48).map((id, i) => ({ id, rank: i + 1 }));
    const { pools } = snakePools(e, 8);
    expect(pools.every((p) => p.length === 6)).toBe(true);
    expect(pools[0].map((p) => p.rank)).toEqual([1, 16, 17, 32, 33, 48]);
    const st: PoolStanding[] = pools.flatMap((p, pi) => p.slice(0, 2).map((x, pos) => ({ pool: pi + 1, position: pos + 1, id: x.id, divisionId: "d" })));
    const a = mapQualifiers(st, { divisionId: "d", perPool: 2, mapping: "cross_pool" });
    const b = mapQualifiers([...st].reverse(), { divisionId: "d", perPool: 2, mapping: "cross_pool" });
    expect(a).toEqual(b);
    expect(a).toHaveLength(8);
    expect(a[0]).toEqual({ slot: 1, a: "p1", b: pools[7][1].id }); // winner Pool A vs runner-up Pool H
    const contract: DivisionContract = { divisionId: "d", unit: "players", expectedEntrants: 48, seeding: { source: "ranking", method: "snake" }, stages: [poolsStage, koStage], placements: "champion" };
    expect(contractIssues(contract).filter((i) => i.level === "error")).toEqual([]);
    const map = tournamentMap(contract);
    expect(map.totalMatches).toBe(135);
    expect(map.lines).toContain("R16 -> QF -> SF -> Final");
  });

  it("6. Club Champs mixes FIXED and PLAY-BY rounds and rejects a deadline treated as a date", () => {
    const c: DivisionContract = { divisionId: "d", unit: "players", expectedEntrants: 16, seeding: { source: "ladder", method: "snake" }, placements: "champion", stages: [
      { id: "r1", order: 0, kind: "knockout", name: "R16", drawSize: 16, schedule: { rule: "play_by", deadline: "2026-10-10" } },
      { id: "f", order: 1, kind: "knockout", name: "Finals", qualify: { perPool: 1, mapping: "same_pool" }, generation: "automatic", schedule: { rule: "fixed", date: "2026-10-24" } },
    ] };
    expect(contractIssues(c).filter((i) => i.level === "error")).toEqual([]);
    c.stages[1].schedule = { rule: "fixed", deadline: "2026-10-24" };
    expect(contractIssues(c).map((i) => i.code)).toContain("schedule_fixed");
  });

  it("7. automatic playoffs wait for every prerequisite result", () => {
    const pre = rrRows("d", "pools", ids(4));
    const auto = { ...koStage, generation: "automatic" as const };
    expect(canGenerateStage({ stage: auto, prerequisite: pre, existing: pre }).ok).toBe(false);
    const done = pre.map((f) => ({ ...f, status: "completed", winner: f.a }));
    expect(canGenerateStage({ stage: auto, prerequisite: done, existing: done }).ok).toBe(true);
  });

  it("8. owner-approval playoffs never generate before confirmation", () => {
    const done = rrRows("d", "pools", ids(4)).map((f) => ({ ...f, status: "completed", winner: f.a }));
    const r = canGenerateStage({ stage: koStage, prerequisite: done, existing: done });
    expect(r).toMatchObject({ ok: false, code: "needs_confirmation" });
    expect(canGenerateStage({ stage: koStage, prerequisite: done, existing: done, ownerConfirmed: true }).ok).toBe(true);
    expect(canGenerateStage({ stage: { ...koStage, qualify: { perPool: 2, mapping: null } }, prerequisite: done, existing: done, ownerConfirmed: true }))
      .toMatchObject({ ok: false, code: "no_mapping" });
  });

  it("9. rebuild never deletes or changes completed results", () => {
    const existing = rrRows("d", "rr", ids(6)).map((f, i) => (i < 5 ? { ...f, status: "completed", winner: f.a, score: "3-1" } : f));
    const before = JSON.stringify(existing.filter(isDecided));
    const plan = planRebuild({ divisionId: "d", configuredRounds: null, activeEntrantIds: ids(6), existing, generate: (i) => rrRows("d", "rr", i) });
    expect(JSON.stringify(plan.keep)).toBe(before);
    expect(plan.removeIds.some((id) => existing.find((f) => f.id === id)!.status === "completed")).toBe(false);
  });

  it("10. doubles playoffs keep pair identity (pairs are units)", () => {
    const st: PoolStanding[] = [
      { pool: 1, position: 1, id: "pair:A1+A2", divisionId: "d" }, { pool: 1, position: 2, id: "pair:B1+B2", divisionId: "d" },
      { pool: 2, position: 1, id: "pair:C1+C2", divisionId: "d" }, { pool: 2, position: 2, id: "pair:D1+D2", divisionId: "d" },
    ];
    const m = mapQualifiers(st, { divisionId: "d", perPool: 2, mapping: "cross_pool" });
    const units = m.flatMap((x) => [x.a, x.b]);
    expect(new Set(units)).toEqual(new Set(st.map((s) => s.id)));
    expect(m[0]).toEqual({ slot: 1, a: "pair:A1+A2", b: "pair:D1+D2" });
  });

  it("11. Nelspruit-style: knockout stays knockout, no re-entry, frozen seeds", () => {
    const ko: FixtureRow[] = [
      { divisionId: "d", stageId: "ko", stageKind: "knockout", round: 1, a: "A", b: "B", winner: "A", status: "completed" },
      { divisionId: "d", stageId: "ko", stageKind: "knockout", round: 1, a: "C", b: "D", winner: "C", status: "completed" },
      { divisionId: "d", stageId: "ko", stageKind: "knockout", round: 2, a: "A", b: "C" },
    ];
    expect(() => assertKnockoutShape(ko)).not.toThrow();
    expect(() => assertNoReentry(ko)).not.toThrow();
    expect(() => assertNoReentry([...ko, { divisionId: "d", stageId: "ko", stageKind: "knockout", round: 2, a: "B", b: "D" }])).toThrow(/reintroduced/);
    expect(() => assertSeedsUnchanged(true, { A: 1, B: 2 }, { A: 2, B: 1 })).toThrow();
    expect(canGenerateStage({ stage: koStage, prerequisite: [], existing: ko, ownerConfirmed: true })).toMatchObject({ ok: false, code: "exists" });
  });

  it("12. court/date/venue constraints are honoured", () => {
    const c = { start: "2026-10-01", end: "2026-10-31", courts: 3, venues: ["Riverside"] };
    const ok: FixtureRow = { divisionId: "d", stageId: "s", stageKind: "knockout", a: "a", b: "b", date: "2026-10-05T18:00", court: 2, venue: "Riverside" };
    expect(() => assertScheduleWithin([ok], c)).not.toThrow();
    expect(() => assertScheduleWithin([{ ...ok, court: 4 }], c)).toThrow(/Court 4/);
    expect(() => assertScheduleWithin([{ ...ok, date: "2026-11-02T18:00" }], c)).toThrow(/after/);
    expect(() => assertScheduleWithin([{ ...ok, venue: "Elsewhere" }], c)).toThrow(/Venue/);
    expect(() => assertScheduleWithin([ok, { ...ok, a: "c", b: "d" }], c)).toThrow(/clash/);
  });

  it("unresolved structure blocks generation", () => {
    const c: DivisionContract = { divisionId: "d", unit: "players", expectedEntrants: null, seeding: { source: null, method: null }, placements: "champion", stages: [
      { ...poolsStage, schedule: { rule: null } }, { ...koStage, qualify: null, generation: undefined },
    ] };
    const codes = contractIssues(c).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["entrants", "schedule_rule", "playoff_qualify", "playoff_generation"]));
  });
});
