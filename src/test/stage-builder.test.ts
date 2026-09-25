import { describe, it, expect } from "vitest";
import { generateStructuredTournament, specFromDefinition, startNextStructuredStage, confirmStructuredPlayoffs, toFixtureRow, type Db } from "@/lib/tournaments/structured-persist";
import { classifyEdit, finalStandings, formPairs, generateFromSpec, serializeSpec, type TournamentSpec } from "@/lib/tournaments/engine-service";
import { contractIssues } from "@/lib/tournaments/contract";
import { DefinitionSchema, type TournamentDefinition } from "@/lib/smart-builder/definition";
import { presetDefinition } from "@/lib/smart-builder/quick-path";
import { addStage, copyPreviousStage, diamondTemplate, moveStage, removeStage, setDiscipline, setFormat, transitionText } from "@/lib/smart-builder/stage-builder";

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


const sched = (def: TournamentDefinition, n: number) => {
  def.divisions[0].sections[0].stages.forEach((s, i) => { s.schedule = { mode: "fixed", startDate: `2026-10-0${i + 1}`, roundDates: [`2026-10-0${i + 1}`] }; });
  def.divisions[0].sections[0].stages[0].input.entrants = n;
  return DefinitionSchema.parse(def);
};
const errs = (def: TournamentDefinition) => contractIssues(specFromDefinition(def).divisions[0]).filter((i) => i.level === "error").map((i) => i.code);

async function setup(def: TournamentDefinition, n: number) {
  const env = fakeDb();
  env.t.tournaments = [{ id: "t", builder_architecture: "structured", builder_spec: serializeSpec(specFromDefinition(def)) }];
  env.t.club_champs_entries = Array.from({ length: n }, (_, i) => ({ id: `e${i}`, champ_id: "t", club_member_id: `p${i + 1}`, group_number: 1, order_index: i }));
  await generateStructuredTournament(env.db, "t");
  return env;
}
/** Lower seed number always wins; for pairs, lower sum wins. */
const playAll = (env: any, stageKey: string) => env.t.club_champs_matches.filter((m: any) => m.stage_key === stageKey && !m.winner_member_id).forEach((m: any) => {
  const v = (a: string, b?: string) => Number(a.slice(1)) + (b ? Number(b.slice(1)) : 0);
  const aWins = v(m.player_a_member_id, m.partner_a_member_id) <= v(m.player_b_member_id, m.partner_b_member_id);
  Object.assign(m, { status: "completed", score: "3-0", winner_member_id: aWins ? m.player_a_member_id : m.player_b_member_id });
});

describe("custom / mixed stage builder", () => {
  it("custom starts as a one-stage builder, not the guided flow", () => {
    const def = presetDefinition("custom");
    expect(def.quickPath).toBe("custom");
    expect(def.divisions[0].sections[0].stages).toHaveLength(1);
  });
  it("add, reorder and remove keep links and reset the moved transitions", () => {
    const def = presetDefinition("custom"); const d = def.divisions[0];
    addStage(d); addStage(d, "knockout");
    const ss = () => d.sections[0].stages;
    expect(ss().map((s) => s.input.fromStageId)).toEqual([null, ss()[0].id, ss()[1].id]);
    // No silent transition: the owner must choose.
    expect(ss()[2].progression).toBeNull();
    const [a, b] = [ss()[0].id, ss()[1].id];
    expect(moveStage(d, b, -1)).toBe(true);
    expect(ss()[0].id).toBe(b); expect(ss()[0].progression).toBeNull(); expect(ss()[1].input.fromStageId).toBe(b);
    expect(moveStage(d, b, -1, new Set([b]))).toBe(false);
    expect(removeStage(d, b, new Set([b]))).toBe(false);
    expect(removeStage(d, a)).toBe(true);
    expect(ss()).toHaveLength(2);
  });
  it("singles → doubles without a pairing rule blocks Generate; unresolved carry/reset blocks too", () => {
    const def = presetDefinition("custom"); const d = def.divisions[0];
    addStage(d); setDiscipline(d, d.sections[0].stages[1].id, "doubles");
    expect(errs(sched(def, 8))).toEqual(expect.arrayContaining(["pairs_model", "standings_rule"]));
    d.sections[0].stages[1].progression = { mode: "all_continue", standings: "carry" };
    expect(errs(sched(def, 8))).toContain("pairs_model");
  });
  it("odd player count can't form pairs; doubles can't feed singles; nothing follows a knockout", () => {
    const def = presetDefinition("custom"); diamondTemplate(def);
    expect(errs(sched(def, 7))).toContain("odd_pairs");
    const d2 = presetDefinition("custom"); const d = d2.divisions[0]; d.entry = "pairs";
    d.sections[0].stages[0].discipline = "doubles"; addStage(d); setDiscipline(d, d.sections[0].stages[1].id, "singles");
    expect(errs(sched(d2, 8))).toContain("split_model");
    const d3 = presetDefinition("custom"); const x = d3.divisions[0];
    setFormat(x, x.sections[0].stages[0].id, "knockout"); addStage(x);
    x.sections[0].stages[1].progression = { mode: "all_continue", standings: "reset" };
    expect(errs(sched(d3, 8))).toContain("after_knockout");
  });
  it("Diamond League: singles RR → pairs formed → doubles RR → cumulative final standings", async () => {
    const def = presetDefinition("custom"); diamondTemplate(def);
    const d = sched(def, 8);
    const [s1, s2] = d.divisions[0].sections[0].stages;
    expect(transitionText(s1, s2)).toContain("1st + 2nd");
    expect(errs(d)).toEqual([]);
    const env = await setup(d, 8);
    expect(env.t.club_champs_matches).toHaveLength(28);
    await expect(startNextStructuredStage(env.db, "t", "div1", s2.id, { ownerConfirmed: true })).rejects.toThrow(/not finished/);
    playAll(env, s1.id);
    await expect(startNextStructuredStage(env.db, "t", "div1", s2.id, { ownerConfirmed: false })).rejects.toThrow(/confirm/);
    await startNextStructuredStage(env.db, "t", "div1", s2.id, { ownerConfirmed: true });
    const dbl = env.t.club_champs_matches.filter((m: any) => m.stage_key === s2.id);
    expect(dbl).toHaveLength(6);
    expect(dbl.every((m: any) => m.partner_a_member_id && m.partner_b_member_id)).toBe(true);
    const pairs = new Set(dbl.flatMap((m: any) => [`${m.player_a_member_id}+${m.partner_a_member_id}`, `${m.player_b_member_id}+${m.partner_b_member_id}`]));
    expect(pairs).toEqual(new Set(["p1+p2", "p3+p4", "p5+p6", "p7+p8"]));
    await expect(startNextStructuredStage(env.db, "t", "div1", s2.id, { ownerConfirmed: true })).rejects.toThrow(/already/);
    playAll(env, s2.id);
    const spec = env.t.tournaments[0].builder_spec as TournamentSpec;
    const rows = env.t.club_champs_matches.map((m: any) => toFixtureRow("div1", m, "round_robin"));
    const table = finalStandings({ ...spec.divisions[0], entrants: Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, rank: i + 1 })) }, rows);
    expect(table[0]).toMatchObject({ id: "p1", points: 7 + 3 });
    expect(table).toHaveLength(8);
    // Completed singles stage can't be reordered or reconfigured afterwards.
    const after = serializeSpec(spec); after.divisions[0].stages.reverse().forEach((s, i) => { s.order = i; });
    expect(classifyEdit(spec, after, rows).blocked).toBe(true);
  });
  it("RR → RR → KO: everyone continues with points reset, then top 4 qualify", async () => {
    const def = presetDefinition("custom"); const d = def.divisions[0];
    addStage(d); addStage(d, "knockout");
    const ss = d.sections[0].stages;
    ss[1].progression = { mode: "all_continue", standings: "reset" };
    ss[1].advance = { role: "qualify", perGroup: 4 }; ss[2].qualifierMapping = "reseed"; ss[2].generation = "owner_approval";
    ss[0].groups = 1;
    const parsed = sched(def, 6);
    expect(errs(parsed)).toEqual([]);
    const env = await setup(parsed, 6);
    playAll(env, ss[0].id);
    await startNextStructuredStage(env.db, "t", "div1", ss[1].id, { ownerConfirmed: true });
    expect(env.t.club_champs_matches.filter((m: any) => m.stage_key === ss[1].id)).toHaveLength(15);
    playAll(env, ss[1].id);
    await expect(startNextStructuredStage(env.db, "t", "div1", ss[2].id, { ownerConfirmed: true })).rejects.toThrow(/play-off/);
    await confirmStructuredPlayoffs(env.db, "t", "div1", ss[2].id, true);
    const ko = env.t.club_champs_matches.filter((m: any) => m.stage_key === ss[2].id);
    expect(ko).toHaveLength(2);
    expect(ko.every((m: any) => m.pool_id == null)).toBe(true);
  });
  it("Swiss → KO validates and generates through the one engine", () => {
    const def = presetDefinition("custom"); const d = def.divisions[0];
    setFormat(d, d.sections[0].stages[0].id, "swiss"); addStage(d, "knockout");
    const ss = d.sections[0].stages;
    ss[1].progression = { mode: "all_continue", standings: "reset" }; ss[1].generation = "owner_approval";
    const parsed = sched(def, 16);
    expect(errs(parsed)).toEqual([]);
    const spec = specFromDefinition(parsed);
    spec.divisions[0].entrants = Array.from({ length: 16 }, (_, i) => ({ id: `p${i + 1}`, rank: i + 1 }));
    expect(generateFromSpec(spec, "t")).toHaveLength(8);
  });
  it("pairing helpers", () => {
    expect(formPairs(["a", "b", "c", "d"], "positions")).toEqual(["a+b", "c+d"]);
    expect(formPairs(["a", "b", "c", "d"], "fold")).toEqual(["a+d", "b+c"]);
    expect(() => formPairs(["a", "b", "c"], "fold")).toThrow();
    expect(() => formPairs(["a", "b"], "manual", [["a", "a"]])).toThrow();
  });
});

describe("every stage is an independent competition stage", () => {
  const custom = () => { const def = presetDefinition("custom"); return { def, d: def.divisions[0] }; };
  const stagesOf = (def: TournamentDefinition) => def.divisions[0].sections[0].stages;

  it("1. singles RR → doubles RR (pairs 1+2, 3+4)", async () => {
    const { def, d } = custom();
    addStage(d); const [, s2] = stagesOf(def);
    setDiscipline(d, s2.id, "doubles");
    s2.progression = { mode: "all_continue", standings: "reset", pairing: "positions" }; s2.generation = "owner_approval";
    const x = sched(def, 8); expect(errs(x)).toEqual([]);
    const env = await setup(x, 8); playAll(env, stagesOf(x)[0].id);
    await startNextStructuredStage(env.db, "t", "div1", s2.id, { ownerConfirmed: true });
    const g = env.t.club_champs_matches.filter((m: any) => m.stage_key === s2.id);
    expect(g).toHaveLength(6);
    expect(g.every((m: any) => m.partner_a_member_id && m.partner_b_member_id)).toBe(true);
  });

  it("2. singles RR → doubles knockout", async () => {
    const { def, d } = custom();
    addStage(d, "knockout"); const [, s2] = stagesOf(def);
    setDiscipline(d, s2.id, "doubles");
    s2.progression = { mode: "all_continue", standings: "reset", pairing: "fold" }; s2.generation = "owner_approval";
    const x = sched(def, 8); expect(errs(x)).toEqual([]);
    const env = await setup(x, 8); playAll(env, stagesOf(x)[0].id);
    await startNextStructuredStage(env.db, "t", "div1", s2.id, { ownerConfirmed: true });
    const g = env.t.club_champs_matches.filter((m: any) => m.stage_key === s2.id);
    expect(g).toHaveLength(2);
    expect(g.every((m: any) => m.partner_a_member_id && !m.pool_id)).toBe(true);
  });

  it("3. singles Swiss → top 4 as doubles RR → singles knockout (pairs split)", async () => {
    const { def, d } = custom();
    setFormat(d, stagesOf(def)[0].id, "swiss"); stagesOf(def)[0].swissRounds = 1;
    addStage(d); addStage(d, "knockout");
    const [s1, s2, s3] = stagesOf(def);
    setDiscipline(d, s2.id, "doubles");
    s2.progression = { mode: "top_n", top: 4, standings: "reset", pairing: "positions" }; s2.generation = "owner_approval";
    s3.progression = { mode: "all_continue", standings: "reset", pairing: "split" }; s3.generation = "owner_approval";
    const x = sched(def, 8); expect(errs(x)).toEqual([]);
    expect(stagesOf(x).map((s) => [s.discipline, s.kind])).toEqual([["singles", "swiss"], ["doubles", "round_robin"], ["singles", "knockout"]]);
    const env = await setup(x, 8); playAll(env, s1.id);
    await startNextStructuredStage(env.db, "t", "div1", s2.id, { ownerConfirmed: true });
    const dbl = env.t.club_champs_matches.filter((m: any) => m.stage_key === s2.id);
    expect(dbl).toHaveLength(1);
    expect(new Set(dbl.flatMap((m: any) => [m.player_a_member_id, m.partner_a_member_id, m.player_b_member_id, m.partner_b_member_id])).size).toBe(4);
    playAll(env, s2.id);
    await startNextStructuredStage(env.db, "t", "div1", s3.id, { ownerConfirmed: true });
    const ko = env.t.club_champs_matches.filter((m: any) => m.stage_key === s3.id);
    expect(ko).toHaveLength(2);
    expect(ko.every((m: any) => !m.partner_a_member_id && !m.partner_b_member_id)).toBe(true);
  });

  it("4 + 5. changing stage 2's format or match type never mutates stage 1", () => {
    const { def, d } = custom();
    stagesOf(def)[0].groups = 2; stagesOf(def)[0].legs = 2;
    addStage(d);
    const before = JSON.stringify(stagesOf(def)[0]);
    setFormat(d, stagesOf(def)[1].id, "knockout");
    setDiscipline(d, stagesOf(def)[1].id, "doubles");
    expect(JSON.stringify(stagesOf(def)[0])).toBe(before);
  });

  it("6. a new stage does not inherit the previous one unless Copy previous is chosen", () => {
    const { def, d } = custom();
    const s1 = stagesOf(def)[0];
    setFormat(d, s1.id, "swiss"); s1.discipline = "doubles"; s1.schedule = { mode: "play_by" } as any;
    addStage(d);
    const s2 = stagesOf(def)[1];
    expect([s2.discipline, s2.kind, s2.groups, s2.schedule.mode, s2.progression]).toEqual(["singles", "round_robin", 1, "unset", null]);
    expect(copyPreviousStage(d, s2.id)).toBe(true);
    expect([s2.discipline, s2.kind, s2.swissRounds, s2.schedule.mode]).toEqual(["doubles", "swiss", s1.swissRounds, "play_by"]);
  });

  it("7. singles → doubles cannot generate without a pair-formation rule", async () => {
    const { def, d } = custom();
    addStage(d); const [s1, s2] = stagesOf(def);
    setDiscipline(d, s2.id, "doubles");
    s2.progression = { mode: "all_continue", standings: "reset" }; s2.generation = "owner_approval";
    const x = sched(def, 8); expect(errs(x)).toContain("pairs_model");
    s2.progression = { mode: "all_continue", standings: "reset", pairing: "split" };
    expect(errs(sched(def, 8))).toContain("pairing");
    // Even if the spec is forced through, the engine refuses.
    const env = await setup(sched(def, 8), 8).catch(() => null);
    if (env) { playAll(env, s1.id); await expect(startNextStructuredStage(env.db, "t", "div1", s2.id, { ownerConfirmed: true })).rejects.toThrow(); }
  });

  it("8. previous-stage finishing positions pair 1+2, 3+4, 5+6", () => {
    expect(formPairs(["a", "b", "c", "d", "e", "f"], "positions")).toEqual(["a+b", "c+d", "e+f"]);
    expect(formPairs(["a", "b", "c", "d"], "fold")).toEqual(["a+d", "b+c"]);
  });

  it("9. doubles pair identity is stable after generation and results", async () => {
    const { def, d } = custom();
    addStage(d); const [s1, s2] = stagesOf(def);
    setDiscipline(d, s2.id, "doubles");
    s2.progression = { mode: "all_continue", standings: "reset", pairing: "positions" }; s2.generation = "owner_approval";
    const env = await setup(sched(def, 8), 8); playAll(env, s1.id);
    await startNextStructuredStage(env.db, "t", "div1", s2.id, { ownerConfirmed: true });
    const units = () => new Set(env.t.club_champs_matches.filter((m: any) => m.stage_key === s2.id).flatMap((m: any) => [`${m.player_a_member_id}+${m.partner_a_member_id}`, `${m.player_b_member_id}+${m.partner_b_member_id}`]));
    const first = units();
    expect(first).toEqual(new Set(["p1+p2", "p3+p4", "p5+p6", "p7+p8"]));
    playAll(env, s2.id);
    expect(units()).toEqual(first);
    // Traceable to players: each player appears in exactly one pair.
    expect([...first].flatMap((u) => u.split("+")).sort()).toHaveLength(8);
  });

  it("10. autosave/reload keeps every stage's independent settings and transitions", () => {
    const { def, d } = custom();
    setFormat(d, stagesOf(def)[0].id, "swiss"); stagesOf(def)[0].swissRounds = 5;
    addStage(d); addStage(d, "knockout");
    const [, s2, s3] = stagesOf(def);
    setDiscipline(d, s2.id, "doubles"); s2.groups = 2; s2.legs = 2;
    s2.progression = { mode: "top_n", top: 8, standings: "carry", pairing: "positions" };
    s3.progression = { mode: "all_continue", standings: "reset", pairing: "split" }; s3.thirdPlace = true;
    const saved = JSON.parse(JSON.stringify(def));
    const back = DefinitionSchema.parse(saved);
    expect(stagesOf(back).map((s) => ({ d: s.discipline, k: s.kind, g: s.groups, l: s.legs, r: s.swissRounds, p: s.progression, t: s.thirdPlace })))
      .toEqual(stagesOf(def).map((s) => ({ d: s.discipline, k: s.kind, g: s.groups, l: s.legs, r: s.swissRounds, p: s.progression, t: s.thirdPlace })));
  });

  it("11. reordering stages re-validates transition dependencies", () => {
    const { def, d } = custom();
    addStage(d); const [, s2] = stagesOf(def);
    setDiscipline(d, s2.id, "doubles");
    s2.progression = { mode: "all_continue", standings: "reset", pairing: "positions" }; s2.generation = "owner_approval";
    expect(errs(sched(def, 8))).toEqual([]);
    moveStage(d, s2.id, -1);
    const e = errs(sched(def, 8));
    expect(e).toEqual(expect.arrayContaining(["first_doubles"]));
    expect(stagesOf(def)[1].progression).toBeNull();
  });

  it("12. started stages cannot be changed, moved or removed", () => {
    const { def, d } = custom();
    addStage(d); const [s1, s2] = stagesOf(def);
    const started = new Set([s1.id]);
    const before = JSON.stringify(s1);
    expect(setFormat(d, s1.id, "knockout", started)).toBe(false);
    expect(setDiscipline(d, s1.id, "doubles", started)).toBe(false);
    expect(moveStage(d, s2.id, -1, started)).toBe(false);
    expect(removeStage(d, s1.id, started)).toBe(false);
    expect(JSON.stringify(s1)).toBe(before);
  });
});
