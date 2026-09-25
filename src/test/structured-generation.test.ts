import { describe, it, expect, beforeEach } from "vitest";
import {
  confirmStructuredPlayoffs, generateStructuredTournament, nextKnockoutRound, persistStructure,
  previewStructuredPlayoffs, specFromDefinition, type Db,
} from "@/lib/tournaments/structured-persist";
import { atomically, rebuildStructured, withdrawStructured, type CommitOp } from "@/lib/tournaments/structured-persist";
import { applyEdit, classifyEdit, serializeSpec, type TournamentSpec } from "@/lib/tournaments/engine-service";
import { DefinitionSchema } from "@/lib/smart-builder/definition";
import { generateRotatingDoublesSchedule } from "@/lib/tournaments/rotating-doubles";

/** In-memory DB that mirrors the guard_structured_match_identity trigger. */
function fakeDb() {
  const t: Record<string, any[]> = {};
  let n = 0;
  const match = (r: any, f: Record<string, unknown>) => Object.entries(f).every(([k, v]) => r[k] === v);
  const guard = (m: any) => {
    const tour = t.tournaments.find((x) => x.id === m.champ_id);
    if (tour.builder_architecture !== "structured") return;
    if (!m.division_id || !m.stage_id || !m.round_id) throw new Error("identity");
    const st = t.tournament_stages.find((x) => x.id === m.stage_id);
    if (st.division_id !== m.division_id) throw new Error("stage/division");
    const rd = t.club_champs_rounds.find((x) => x.id === m.round_id);
    if (rd.stage_id !== m.stage_id) throw new Error("round/stage");
    if (["knockout", "placement"].includes(st.kind) && m.pool_id) throw new Error("ko pool");
    if (st.kind === "pools" && (!m.pool_id || t.tournament_pools.find((p) => p.id === m.pool_id).stage_id !== m.stage_id)) throw new Error("pool");
  };
  const db: Db = {
    async insert(table, rows) {
      const out = rows.map((r) => ({ id: `${table}-${++n}`, ...r }));
      if (table === "club_champs_matches") out.forEach(guard);
      if (table === "club_champs_rounds") out.forEach((r: any) => {
        if (!["knockout", "semi_final", "final", "third_place", "round_robin", "swiss"].includes(r.round_type)) throw new Error("round_type check");
        if (!["pending", "active", "complete"].includes(r.status)) throw new Error("round status check");
      });
      (t[table] ??= []).push(...out);
      return out;
    },
    async select(table, f) { return (t[table] ?? []).filter((r) => match(r, f)); },
    async update(table, f, patch) { (t[table] ?? []).filter((r) => match(r, f)).forEach((r) => Object.assign(r, patch)); },
    async remove(table, ids) {
      for (const id of ids) {
        const r = (t[table] ?? []).find((x) => x.id === id);
        if (table === "club_champs_matches" && r?.winner_member_id) throw new Error("played game cannot be removed");
      }
      t[table] = (t[table] ?? []).filter((x) => !ids.includes(x.id));
    },
  };
  return { db, t };
}

const def = DefinitionSchema.parse({
  name: "Club Championships",
  divisions: ["men", "ladies"].map((id) => ({
    id, name: id === "men" ? "1st League" : "Ladies", poolLabels: ["Pool A", "Pool B"],
    sections: [{ id: "s", name: "Main", stages: [
      { id: "pools", name: "Pool Stage", kind: "round_robin", groups: 2, groupSize: 4, input: { entrants: 8 }, advance: { role: "qualify", perGroup: 2 }, schedule: { mode: "fixed", roundDates: ["2026-10-03"] } },
      { id: "ko", name: "Knockout", kind: "knockout", groups: 1, groupSize: 4, input: { fromStageId: "pools" }, qualifierMapping: "cross_pool", generation: "owner_approval", schedule: { mode: "play_by", endDate: "2026-10-20" } },
    ] }],
  })),
});

let env: ReturnType<typeof fakeDb>;
const TID = "t1";
beforeEach(async () => {
  env = fakeDb();
  const spec = specFromDefinition(def);
  env.t.tournaments = [{ id: TID, builder_architecture: "structured", builder_spec: serializeSpec(spec) }, { id: "legacy", builder_architecture: "legacy" }];
  env.t.club_champs_entries = [
    ...Array.from({ length: 8 }, (_, i) => ({ id: `em${i + 1}`, champ_id: TID, club_member_id: `m${i + 1}`, group_number: 1, order_index: i })),
    ...Array.from({ length: 8 }, (_, i) => ({ id: `el${i + 1}`, champ_id: TID, club_member_id: `l${i + 1}`, group_number: 2, order_index: i })),
  ];
});

const matches = () => env.t.club_champs_matches ?? [];
const finishPools = () => matches().filter((m) => m.pool_id).forEach((m) => {
  const a = Number(m.player_a_member_id.slice(1)), b = Number(m.player_b_member_id.slice(1));
  Object.assign(m, { status: "completed", winner_member_id: a < b ? m.player_a_member_id : m.player_b_member_id, score: "3-0" });
});

describe("structured Beta generation", () => {
  it("persists structure first; pool games carry division/stage/pool/round ids", async () => {
    await generateStructuredTournament(env.db, TID);
    expect(env.t.tournament_divisions).toHaveLength(2);
    expect(env.t.tournament_pools).toHaveLength(4);
    const m = matches()[0];
    const pool = env.t.tournament_pools.find((p) => p.id === m.pool_id);
    const stage = env.t.tournament_stages.find((s) => s.id === m.stage_id);
    expect(stage.kind).toBe("pools");
    expect(pool.stage_id).toBe(stage.id);
    expect(stage.division_id).toBe(m.division_id);
    expect(env.t.club_champs_rounds.find((r) => r.id === m.round_id).stage_id).toBe(stage.id);
    expect(matches()).toHaveLength(2 * 2 * 6);
  });

  it("two divisions stay isolated even with identical pool labels", async () => {
    await generateStructuredTournament(env.db, TID);
    const men = env.t.tournament_divisions.find((d) => d.spec_key === "men").id;
    const poolsOfMen = new Set(env.t.tournament_pools.filter((p) => env.t.tournament_stages.find((s) => s.id === p.stage_id).division_id === men).map((p) => p.id));
    for (const m of matches()) {
      const isMen = m.division_id === men;
      expect(poolsOfMen.has(m.pool_id)).toBe(isMen);
      expect(String(m.player_a_member_id).startsWith(isMen ? "m" : "l")).toBe(true);
    }
  });

  it("custom labels are labels only (1st League division, 'Pool A' names) — ids/kinds unaffected", async () => {
    await generateStructuredTournament(env.db, TID);
    const d = env.t.tournament_divisions.find((x) => x.label === "1st League");
    expect(d.spec_key).toBe("men");
    expect(env.t.tournament_pools.every((p) => ["Pool A", "Pool B"].includes(p.label))).toBe(true);
  });

  it("blocks generation for structurally invalid specs and for games already existing", async () => {
    const bad = serializeSpec(env.t.tournaments[0].builder_spec);
    bad.divisions[0].stages[1].qualify = { perPool: 2, mapping: null };
    env.t.tournaments[0].builder_spec = bad;
    await expect(generateStructuredTournament(env.db, TID)).rejects.toThrow();
    expect(matches()).toHaveLength(0);
  });

  it("legacy tournaments cannot enter the structured path", async () => {
    await expect(generateStructuredTournament(env.db, "legacy")).rejects.toThrow(/structured/);
    await expect(persistStructure(env.db, "legacy", specFromDefinition(def))).rejects.toThrow(/structured/);
  });

  it("playoffs cannot be previewed before pool results are in", async () => {
    await generateStructuredTournament(env.db, TID);
    const p = await previewStructuredPlayoffs(env.db, TID, "men", "ko");
    expect(p.ok).toBe(false);
  });

  it("preview matches qualifiers; confirm creates knockout games with NULL pool; QF from Pool A is not Pool A", async () => {
    await generateStructuredTournament(env.db, TID);
    finishPools();
    const p = await previewStructuredPlayoffs(env.db, TID, "men", "ko");
    expect(p.ok).toBe(true);
    await expect(confirmStructuredPlayoffs(env.db, TID, "men", "ko", false)).rejects.toThrow(/confirm/);
    const created = await confirmStructuredPlayoffs(env.db, TID, "men", "ko", true);
    expect(created.map((c) => [c.player_a_member_id, c.player_b_member_id])).toEqual(p.qualifiers.map((q) => [q.a, q.b]));
    const koStage = env.t.tournament_stages.find((s) => s.spec_key === "ko" && s.division_id === created[0].division_id);
    for (const c of created) {
      expect(c.pool_id).toBeNull();
      expect(c.stage_id).toBe(koStage.id);
      expect(c.stage).toBe("ko");
    }
    await expect(confirmStructuredPlayoffs(env.db, TID, "men", "ko", true)).rejects.toThrow();
  });

  it("final round keeps knockout identity and never re-enters losers", async () => {
    await generateStructuredTournament(env.db, TID);
    finishPools();
    const sf = await confirmStructuredPlayoffs(env.db, TID, "men", "ko", true);
    sf.forEach((m) => { m.winner_member_id = m.player_a_member_id; m.status = "completed"; });
    const rows = sf.map((m) => ({ id: m.id, divisionId: "men", stageId: "ko", stageKind: "knockout" as const, round: m.round_number, a: m.player_a_member_id, b: m.player_b_member_id, winner: m.winner_member_id, slot: m.bracket_position }));
    const fin = nextKnockoutRound(TID, "men", "ko", rows);
    expect(fin).toHaveLength(1);
    expect(fin[0]).toMatchObject({ poolId: null, stageKind: "knockout", round: 2, a: sf[0].player_a_member_id, b: sf[1].player_a_member_id });
  });
});

describe("structured editing", () => {
  const base = (): TournamentSpec => ({ ...specFromDefinition(def), divisions: specFromDefinition(def).divisions.map((d) => ({ ...d, entrants: Array.from({ length: 8 }, (_, i) => ({ id: `${d.divisionId[0]}${i + 1}`, rank: i + 1 })), expectedEntrants: 8 })) });

  it("reopening reconstructs the exact persisted spec", () => {
    const s = base();
    expect(serializeSpec(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("safe future date change does not rebuild anything", () => {
    const a = base(); const b = base();
    b.divisions[0].stages[1].schedule = { rule: "play_by", deadline: "2026-10-27" };
    const i = classifyEdit(a, b, [{ divisionId: "men", stageId: "pools", stageKind: "pools", a: "m1", b: "m2", status: "completed", winner: "m1" }]);
    expect(i.kind).toBe("safe");
    expect(i.affectedDivisions).toEqual([]);
  });

  it("rename is a label change only", () => {
    const a = base(); const b = base();
    b.divisions[0].label = "Men's Championship"; b.divisions[0].poolLabels = ["Red", "Blue"];
    expect(classifyEdit(a, b, []).kind).toBe("safe");
  });

  it("pool change before play previews and regenerates only that division", () => {
    const a = base(); const b = base();
    b.divisions[0].stages[0].pools = 4; b.divisions[0].stages[0].poolSize = 2; b.divisions[0].stages[1].drawSize = 8;
    const ladiesGame = { id: "x", tournamentId: "t", roundId: "r", poolId: "p", divisionId: "ladies", stageId: "pools", stageKind: "pools" as const, a: "l1", b: "l2", status: "completed", winner: "l1" };
    const i = classifyEdit(a, b, [ladiesGame]);
    expect(i).toMatchObject({ kind: "structural", blocked: false, affectedDivisions: ["men"] });
    const plan = applyEdit(b, i, [ladiesGame], "t");
    expect(plan.keep).toEqual([ladiesGame]);
    expect(plan.create.every((f) => f.divisionId === "men")).toBe(true);
  });

  it("pool change after results is blocked", () => {
    const a = base(); const b = base();
    b.divisions[0].stages[0].pools = 4;
    const i = classifyEdit(a, b, [{ divisionId: "men", stageId: "pools", stageKind: "pools", a: "m1", b: "m2", status: "completed", winner: "m1" }]);
    expect(i.blocked).toBe(true);
    expect(() => applyEdit(b, i, [], "t")).toThrow(/locked/);
  });
});

describe("rotating doubles cap", () => {
  it("never exceeds the configured maximum", () => {
    for (const n of [9, 10, 11, 13]) for (const cap of [3, 5, 7]) {
      const { games } = generateRotatingDoublesSchedule(Array.from({ length: n }, (_, i) => `p${i}`), { maxMatchesPerPlayer: cap });
      const c = new Map<string, number>();
      for (const g of games) for (const p of [...g.sideA, ...g.sideB]) c.set(p, (c.get(p) ?? 0) + 1);
      expect(Math.max(...c.values())).toBeLessThanOrEqual(cap);
    }
  });
});

/** Replays a commit onto the fake DB in one go (stands in for the server transaction). */
const sendTo = (db: Db, log: CommitOp[][]) => async (_tid: string, ops: CommitOp[]) => {
  log.push(ops);
  for (const o of ops) {
    if (o.op === "insert") await db.insert(o.table, o.rows);
    else if (o.op === "delete_unplayed_matches") await db.remove!("club_champs_matches", o.ids);
    else if (o.op === "delete_entries") await db.remove!("club_champs_entries", o.ids);
    else await db.update("tournaments", {}, { builder_spec: o.spec });
  }
};
const finish = (rows: any[], pick: (m: any) => string) => rows.forEach((m) => { m.winner_member_id = pick(m); m.status = "completed"; });

describe("all-or-nothing commit", () => {
  it("a failing generation sends nothing", async () => {
    const log: CommitOp[][] = [];
    env.t.club_champs_entries = [];
    await expect(atomically(env.db, TID, sendTo(env.db, log), (db) => generateStructuredTournament(db, TID))).rejects.toThrow();
    expect(log).toHaveLength(0);
    expect(env.t.tournament_divisions ?? []).toHaveLength(0);
  });
  it("a successful generation is one commit with structure + rounds + games", async () => {
    const log: CommitOp[][] = [];
    await atomically(env.db, TID, sendTo(env.db, log), (db) => generateStructuredTournament(db, TID));
    expect(log).toHaveLength(1);
    const tables = log[0].map((o) => (o.op === "insert" ? o.table : o.op));
    expect(tables).toContain("tournament_divisions");
    expect(tables).toContain("club_champs_matches");
    expect(env.t.club_champs_matches).toHaveLength(24);
  });
});

describe("rebuild + withdrawal", () => {
  it("rebuild before play regenerates from current entries", async () => {
    const send = sendTo(env.db, []);
    await atomically(env.db, TID, send, (db) => generateStructuredTournament(db, TID));
    env.t.club_champs_entries = env.t.club_champs_entries.filter((e) => e.club_member_id !== "m8");
    const r = await atomically(env.db, TID, send, (db) => rebuildStructured(db, TID));
    expect(r.regenerated).toContain("1st League");
    const men = env.t.club_champs_matches.filter((m) => m.group_number === 1);
    expect(men.some((m) => [m.player_a_member_id, m.player_b_member_id].includes("m8"))).toBe(false);
    expect(men.every((m) => m.division_id && m.stage_id && m.round_id && m.pool_id)).toBe(true);
  });
  it("withdrawal after play keeps results and removes only that player's unplayed games", async () => {
    const send = sendTo(env.db, []);
    await atomically(env.db, TID, send, (db) => generateStructuredTournament(db, TID));
    const m1Games = env.t.club_champs_matches.filter((m) => [m.player_a_member_id, m.player_b_member_id].includes("m1"));
    finish([m1Games[0]], (m) => m.player_a_member_id);
    const before = env.t.club_champs_matches.length;
    await atomically(env.db, TID, send, (db) => withdrawStructured(db, TID, "m1"));
    const left = env.t.club_champs_matches.filter((m) => [m.player_a_member_id, m.player_b_member_id].includes("m1"));
    expect(left).toHaveLength(1);
    expect(left[0].winner_member_id).toBeTruthy();
    expect(env.t.club_champs_matches.length).toBe(before - (m1Games.length - 1));
    expect(env.t.club_champs_matches.filter((m) => m.group_number === 2)).toHaveLength(12); // ladies untouched
  });
});

describe("disposable full simulation", () => {
  it("create → pools → results → preview → confirm → SF → final → rebuild keeps history", async () => {
    const send = sendTo(env.db, []);
    await atomically(env.db, TID, send, (db) => generateStructuredTournament(db, TID));
    const rank = (id: string) => Number(id.slice(1));
    const seedWin = (m: any) => (rank(m.player_a_member_id) < rank(m.player_b_member_id) ? m.player_a_member_id : m.player_b_member_id);
    finish(env.t.club_champs_matches.filter((m) => m.group_number === 1), seedWin);
    const p = await previewStructuredPlayoffs(env.db, TID, "men", "ko");
    expect(p.ok).toBe(true);
    await atomically(env.db, TID, send, (db) => confirmStructuredPlayoffs(db, TID, "men", "ko", true));
    const sf = env.t.club_champs_matches.filter((m) => m.stage_key === "ko");
    expect(sf).toHaveLength(2);
    expect(sf.every((m) => m.pool_id == null && m.stage === "ko")).toBe(true);
    finish(sf, seedWin);
    const rows = sf.map((m) => ({ id: m.id, divisionId: "men", stageId: "ko", stageKind: "knockout" as const, round: m.round_number, a: m.player_a_member_id, b: m.player_b_member_id, winner: m.winner_member_id, slot: m.bracket_position }));
    const fin = nextKnockoutRound(TID, "men", "ko", rows);
    expect(fin).toHaveLength(1);
    expect(fin[0].poolId).toBeNull();
    const played = env.t.club_champs_matches.filter((m) => m.winner_member_id).length;
    await atomically(env.db, TID, send, (db) => rebuildStructured(db, TID));
    expect(env.t.club_champs_matches.filter((m) => m.winner_member_id).length).toBe(played);
    expect(() => nextKnockoutRound(TID, "men", "ko", [...rows, { ...fin[0], winner: fin[0].a }])).toThrow(/final/);
  });
});

describe("double round robin, Swiss tie-breaks, 3rd place", () => {
  const baseDiv = (stages: any[], n = 8) => ({
    divisionId: "d", label: "D", unit: "players" as const, expectedEntrants: n, seeding: { source: "entry_order", method: "snake" as const },
    placements: "champion" as const, stages, entrants: Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, rank: i + 1 })),
  });
  const sch = { rule: "fixed" as const, date: "2026-10-01" };
  it("twice = every pairing twice with sides swapped, rounds continue", async () => {
    const { generateFromSpec } = await import("@/lib/tournaments/engine-service");
    const d = baseDiv([{ id: "rr", order: 0, kind: "round_robin", name: "RR", legs: 2, schedule: sch }], 4);
    const fx = generateFromSpec({ version: 1, architecture: "structured", name: "x", divisions: [d as any] }, "t");
    expect(fx).toHaveLength(12);
    expect(Math.max(...fx.map((f) => f.round!))).toBe(6);
    expect(fx.filter((f) => f.a === "p1" && f.b === "p2").length + fx.filter((f) => f.a === "p2" && f.b === "p1").length).toBe(2);
  });
  it("Swiss: round 1 generated, next round pairs by wins + tie-breaks, never beyond round count or repeats", async () => {
    const { generateFromSpec, nextSwissRound, swissStandings } = await import("@/lib/tournaments/engine-service");
    const st = { id: "sw", order: 0, kind: "swiss", name: "Swiss", swissRounds: 2, tieBreaks: ["buchholz"], schedule: sch };
    const d = baseDiv([st]) as any;
    const r1 = generateFromSpec({ version: 1, architecture: "structured", name: "x", divisions: [d] }, "t");
    expect(r1).toHaveLength(4);
    const done = r1.map((f) => ({ ...f, winner: f.a, status: "completed" }));
    const r2 = nextSwissRound("t", d, "sw", done);
    const winners = new Set(done.map((f) => f.a));
    expect(r2.every((f) => winners.has(f.a!) === winners.has(f.b!))).toBe(true);
    const played = new Set(done.map((f) => [f.a, f.b].sort().join("|")));
    expect(r2.some((f) => played.has([f.a, f.b].sort().join("|")))).toBe(false);
    expect(swissStandings(d, st as any, done)[0].points).toBe(1);
    expect(() => nextSwissRound("t", d, "sw", [...done, ...r2.map((f) => ({ ...f, winner: f.a }))])).toThrow(/Swiss rounds/);
  });
  it("3rd place: losing semi-finalists play; not treated as re-entry; final stays the final", () => {
    const sf = [
      { id: "s1", divisionId: "d", stageId: "ko", stageKind: "knockout" as const, round: 1, a: "p1", b: "p4", winner: "p1", slot: 1 },
      { id: "s2", divisionId: "d", stageId: "ko", stageKind: "knockout" as const, round: 1, a: "p2", b: "p3", winner: "p3", slot: 2 },
    ];
    const next = nextKnockoutRound("t", "d", "ko", sf as any, { thirdPlace: true });
    expect(next).toHaveLength(2);
    expect(next.find((f) => !f.thirdPlace)).toMatchObject({ a: "p1", b: "p3" });
    expect(next.find((f) => f.thirdPlace)).toMatchObject({ a: "p4", b: "p2" });
    const played = next.map((f) => ({ ...f, winner: f.a }));
    expect(() => nextKnockoutRound("t", "d", "ko", [...sf, ...played] as any, { thirdPlace: true })).toThrow(/final/);
  });
});
