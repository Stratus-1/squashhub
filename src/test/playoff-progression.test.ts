import { describe, it, expect } from "vitest";
import { attachPlannedPlayoffs, finalDrawSpec, unitsFor, type DivFormat, type DrawDivision, type RegLite } from "@/lib/smart-builder/step-draw";
import { allocateSlots, buildPlayoffChain, crossoverPairs, seededPairs } from "@/lib/smart-builder/playoff-chain";
import { resolveConflict, setupConflicts } from "@/lib/smart-builder/consistency";
import { generateStructuredTournament, type Db } from "@/lib/tournaments/structured-persist";
import { autoProgress, confirmNextStage, previewNextStage, stageLifecycle } from "@/lib/tournaments/progression";
import type { PlannedPlayoff } from "@/lib/tournaments/engine-service";

function fakeDb() {
  const t: Record<string, any[]> = {};
  let n = 0;
  const match = (r: any, f: Record<string, unknown>) => Object.entries(f).every(([k, v]) => r[k] === v);
  const db: Db = {
    async insert(table, rows) {
      const out = rows.map((r) => ({ id: `${table}-${++n}`, ...r }));
      if (table === "club_champs_matches") for (const m of out as any[])
        if ((t.club_champs_matches ?? []).some((x) => x.stage_id === m.stage_id && x.round_number === m.round_number)) throw new Error("This stage round already has games (already generated)");
      (t[table] ??= []).push(...out);
      return out;
    },
    async select(table, f) { return (t[table] ?? []).filter((r) => match(r, f)); },
    async update(table, f, patch) { (t[table] ?? []).filter((r) => match(r, f)).forEach((r) => Object.assign(r, patch)); },
  };
  return { db, t };
}

// Riverside shape: Men A v Men B, Ladies A v Ladies B, 5 doubles pairs each.
const regs: RegLite[] = [];
for (let g = 1; g <= 4; g++) for (let p = 1; p <= 5; p++) {
  const a = `g${g}p${p}a`, b = `g${g}p${p}b`;
  regs.push({ club_member_id: a, partner_member_id: b, status: "pending_payment", division_choices: [g] });
  regs.push({ club_member_id: b, partner_member_id: a, status: "pending_payment", division_choices: [g] });
}
const SF: PlannedPlayoff = { pairing: "crossover", mode: "scheduled", date: "2026-11-02", from: "15:29", to: "21:29", courtIds: [20, 21, 24, 26] };
const FINAL: PlannedPlayoff = { pairing: "same_position", mode: "scheduled", date: "2026-11-03", from: "08:29", to: "17:29", courtIds: [20, 21, 24, 26] };
const fmt: DivFormat = { kind: "cross", pools: 1, swissRounds: 0, seeding: "entry_order", schedule: { rule: "play_by", deadlines: ["2026-10-25"], upto: [], dates: [] }, crossGroups: [] };
const vs: Record<number, number> = { 1: 2, 2: 1, 3: 4, 4: 3 };
const divs = (trigger: "auto" | "confirm" | null): DrawDivision[] => [1, 2, 3, 4].map((g) => ({
  group: g, label: `${g <= 2 ? "Mens" : "Ladies"} › ${g % 2 ? "A" : "B"} · Doubles`, doubles: true, units: unitsFor(regs, g, 4, true).units,
  format: { ...fmt, crossVs: [vs[g]], crossGroups: [g, vs[g]].sort() }, notes: [],
  playoffs: ["Semifinals", "Final"], playoffPlans: [{ ...SF, trigger }, { ...FINAL, trigger }],
}));

async function setup(trigger: "auto" | "confirm" | null) {
  const env = fakeDb();
  env.t.tournaments = [{ id: "t", builder_architecture: "structured", builder_spec: finalDrawSpec("T", divs(trigger), "v1"), start_date: "2026-10-08", end_date: null }];
  env.t.club_champs_entries = [];
  for (let g = 1; g <= 4; g++) for (let p = 1; p <= 5; p++) env.t.club_champs_entries.push({ id: `e${g}${p}`, champ_id: "t", club_member_id: `g${g}p${p}a`, partner_member_id: `g${g}p${p}b`, group_number: g, order_index: p });
  await generateStructuredTournament(env.db, "t");
  return env;
}
const p = (id: string) => Number(/p(\d)/.exec(id)![1]);
/** Lower pair number wins every game, so league position n = pair n. */
function play(env: ReturnType<typeof fakeDb>, stage: string, group: number, win: (a: string, b: string) => string = (a, b) => (p(a) < p(b) ? a : b)) {
  for (const m of env.t.club_champs_matches.filter((x: any) => x.stage_key === stage && x.group_number === group && !x.winner_member_id)) { m.winner_member_id = win(m.player_a_member_id, m.player_b_member_id); m.status = "completed"; }
}
const pair = (m: any, s: "a" | "b") => `${m[`player_${s}_member_id`]}+${m[`partner_${s}_member_id`]}`;
const st = async (env: any, name: string, div: string) => (await stageLifecycle(env.db, "t")).find((s) => s.name === name && s.divisionKey === div)!;

describe("Step-by-Step play-off progression", () => {
  it("timeline play-offs become real stages: SF from standings (crossover), Final from SF winners, schedule carried", async () => {
    const env = await setup("confirm");
    const d = env.t.tournaments[0].builder_spec.divisions[0];
    expect(d.stages.map((s: any) => s.name)).toEqual(["Cross-league round robin", "Semifinals", "Final"]);
    expect(d.stages[1].mapping.source).toBe("stage_standings");
    expect(d.stages[2].mapping).toMatchObject({ source: "stage_winners", sourceStageId: d.stages[1].id });
    expect(d.stages[1].schedule).toMatchObject({ rule: "fixed", date: "2026-11-02", timeFrom: "15:29", timeTo: "21:29", courtIds: [20, 21, 24, 26] });
    expect(d.stages[2].schedule).toMatchObject({ date: "2026-11-03", timeFrom: "08:29", timeTo: "17:29" });
    expect(d.deferredStages).toEqual([]);
  });

  it("confirmation trigger: offered when the path finishes, not created until confirmed, created once; other path unaffected", async () => {
    const env = await setup("confirm");
    const [men, ladies] = env.t.tournaments[0].builder_spec.divisions.map((x: any) => x.divisionId);
    const mainKey = env.t.tournaments[0].builder_spec.divisions[0].stages[0].id;
    play(env, mainKey, 1);
    const before = JSON.stringify(env.t.club_champs_matches);
    expect((await st(env, "Semifinals", men)).state).toBe("ready");
    expect((await st(env, "Semifinals", men)).automatic).toBe(false);
    expect((await st(env, "Semifinals", ladies)).state).toBe("waiting");
    expect((await autoProgress(env.db, "t")).started).toEqual([]);
    expect(JSON.stringify(env.t.club_champs_matches)).toBe(before);
    const prev = await previewNextStage(env.db, "t", men, (await st(env, "Semifinals", men)).stageKey);
    expect(prev.map((m) => `${pair(m, "a")} v ${pair(m, "b")}`)).toEqual(["g1p1a+g1p1b v g2p2a+g2p2b", "g2p1a+g2p1b v g1p2a+g1p2b"]);
    await confirmNextStage(env.db, "t", men, (await st(env, "Semifinals", men)).stageKey);
    await expect(confirmNextStage(env.db, "t", men, (await st(env, "Semifinals", men)).stageKey)).rejects.toThrow();
    const sf = env.t.club_champs_matches.filter((m: any) => m.stage_label === "Semifinals");
    expect(sf).toHaveLength(2);
    expect(sf.every((m: any) => m.scheduled_date === "2026-11-02")).toBe(true);
    // Earlier results untouched.
    expect(JSON.stringify(env.t.club_champs_matches.filter((m: any) => m.stage_key === mainKey))).toBe(JSON.stringify(JSON.parse(before).filter((m: any) => m.stage_key === mainKey)));
    expect(env.t.club_champs_matches.filter((m: any) => m.group_number === 3 && m.stage_label === "Semifinals")).toHaveLength(0);
  });

  it("Final is played by the semifinal WINNERS, never original league positions", async () => {
    const env = await setup("confirm");
    const men = env.t.tournaments[0].builder_spec.divisions[0].divisionId;
    play(env, env.t.tournaments[0].builder_spec.divisions[0].stages[0].id, 1);
    await confirmNextStage(env.db, "t", men, (await st(env, "Semifinals", men)).stageKey);
    // Upsets: the second-placed pairs win both semis.
    play(env, (await st(env, "Semifinals", men)).stageKey, 1, (a, b) => (p(a) > p(b) ? a : b));
    expect((await st(env, "Final", men)).state).toBe("ready");
    const fin = await previewNextStage(env.db, "t", men, (await st(env, "Final", men)).stageKey);
    expect(fin.map((m) => `${pair(m, "a")} v ${pair(m, "b")}`)).toEqual(["g2p2a+g2p2b v g1p2a+g1p2b"]);
    expect(fin[0].scheduled_date).toBe("2026-11-03");
  });

  it("automatic trigger: next stage created exactly once after completion; retries don't duplicate", async () => {
    const env = await setup("auto");
    const men = env.t.tournaments[0].builder_spec.divisions[0].divisionId;
    play(env, env.t.tournaments[0].builder_spec.divisions[0].stages[0].id, 1);
    expect((await autoProgress(env.db, "t")).started.map((s) => s.name)).toEqual(["Semifinals"]);
    await autoProgress(env.db, "t"); await Promise.all([autoProgress(env.db, "t"), autoProgress(env.db, "t")]);
    expect(env.t.club_champs_matches.filter((m: any) => m.stage_label === "Semifinals")).toHaveLength(2);
    play(env, (await st(env, "Semifinals", men)).stageKey, 1);
    expect((await autoProgress(env.db, "t")).started.map((s) => s.name)).toEqual(["Final"]);
    await autoProgress(env.db, "t");
    const fin = env.t.club_champs_matches.filter((m: any) => m.stage_label === "Final");
    expect(fin.map((m: any) => `${pair(m, "a")} v ${pair(m, "b")}`)).toEqual(["g1p1a+g1p1b v g2p1a+g2p1b"]);
  });

  it("existing draws (historical 'Decide later') get real stages that wait for the organiser, idempotently", async () => {
    const env = fakeDb();
    const spec = finalDrawSpec("T", divs(null).map((d) => ({ ...d, playoffs: [], playoffPlans: [] })), "v1");
    const plan = { playoff: { choice: "later" }, format: { kind: "cross", crossMode: "parent" }, stages: [
      { id: "s", phase: "playoff", mode: "scheduled", date: "2026-11-02", from: "15:29", to: "21:29", name: "Semifinals", pairing: "crossover", courtIds: ["20", "21"], start: "auto" },
      { id: "f", phase: "playoff", mode: "scheduled", date: "2026-11-03", from: "08:29", to: "17:29", name: "Final", pairing: "same_position", courtIds: ["20"] },
    ] };
    const next = attachPlannedPlayoffs(spec, plan)!;
    for (const d of next.divisions as any[]) {
      expect(d.stages.map((s: any) => [s.name, !!s.waitForOrganiser])).toEqual([["Cross-league round robin", false], ["Semifinals", true], ["Final", true]]);
      expect(d.stages[0]).toEqual(spec.divisions.find((x) => x.divisionId === d.divisionId)!.stages[0]);
    }
    expect(attachPlannedPlayoffs(next, plan)).toBeNull();
    void env;
  });
});

describe("stage chains and scheduling", () => {
  const rr = { id: "m", order: 0, kind: "round_robin", name: "RR", poolMembers: [Array.from({ length: 8 }, (_, i) => `p${i}`)], schedule: { rule: "play_by", deadline: "2026-10-01" } } as any;
  const at = (date: string): PlannedPlayoff => ({ pairing: "seeded", mode: "play_by", deadline: date });
  it("QF → SF → Final: QF seeded from standings, SF and Final from winners", () => {
    const c = buildPlayoffChain(rr, "v", [{ name: "Quarterfinal", plan: at("2026-10-05") }, { name: "Semifinal", plan: { ...at("2026-10-06"), pairing: "winners" } }, { name: "Final", plan: { ...at("2026-10-07"), pairing: "winners" } }]);
    expect(c.reason).toBeNull();
    expect(c.stages.map((s) => [s.name, s.mapping!.source, s.mapping!.matches.length])).toEqual([["Quarterfinal", "stage_standings", 4], ["Semifinal", "stage_winners", 2], ["Final", "stage_winners", 1]]);
    expect(c.stages[0].mapping!.matches.map((m) => `${m.a} v ${m.b}`)).toEqual(["A1 v A8", "A4 v A5", "A2 v A7", "A3 v A6"]);
    expect(c.stages[1].mapping!.sourceStageId).toBe(c.stages[0].id);
  });
  it("Rounds → SF → Final with no QF", () => {
    const c = buildPlayoffChain(rr, "v", [{ name: "Semifinal", plan: at("2026-10-06") }, { name: "Final", plan: at("2026-10-07") }]);
    expect(c.stages.map((s) => s.mapping!.matches.map((m) => `${m.a} v ${m.b}`).join(","))).toEqual(["A1 v A4,A2 v A3", "A1 v A2"]);
  });
  it("never guesses: missing pairing or date stops with a reason", () => {
    expect(buildPlayoffChain(rr, "v", [{ name: "Final", plan: { mode: "play_by", deadline: "2026-10-07" } }]).reason).toMatch(/pairing/);
    expect(buildPlayoffChain(rr, "v", [{ name: "Final", plan: { pairing: "seeded", mode: "later" } }]).reason).toMatch(/Decide later/);
  });
  it("bracket helpers", () => {
    expect(seededPairs(8)).toEqual([[1, 8], [4, 5], [2, 7], [3, 6]]);
    expect(crossoverPairs(2)).toEqual([[[0, 1], [1, 2]], [[1, 1], [0, 2]]]);
  });
  it("allocates games inside the planned window on free courts only", () => {
    expect(allocateSlots(2, { from: "15:29", to: "21:29", courtIds: [20, 21, 24, 26], minutes: 45, busy: [] })).toEqual([{ courtId: 20, time: "15:29" }, { courtId: 21, time: "15:29" }]);
    expect(allocateSlots(2, { from: "15:29", to: "21:29", courtIds: [20, 21], minutes: 45, busy: [{ courtId: 20, start: "15:00:00", end: "16:00:00" }] })).toEqual([{ courtId: 21, time: "15:29" }, { courtId: 20, time: "16:14" }]);
    expect(allocateSlots(2, { from: "15:00", to: "15:45", courtIds: [20], minutes: 45, busy: [] })).toEqual([{ courtId: 20, time: "15:00" }, null]);
  });
});

describe("cross-step consistency", () => {
  const a = { playoff: { choice: "later" }, stages: [
    { id: "r", phase: "main", name: "Round 1" },
    { id: "s", phase: "playoff", name: "Semifinal", pairing: "crossover" },
    { id: "f", phase: "playoff", name: "Final", pairing: "same_position" },
  ] };
  it("Decide later + configured playoffs requires reconciliation; Yes makes them authoritative, No removes them", () => {
    const c = setupConflicts(a);
    const pc = c.find((x) => x.id === "playoffs_vs_timeline")!;
    expect(pc.message).toContain("Earlier you selected 'Decide later' for playoffs, but you have now configured a Semifinal and a Final");
    const yes = resolveConflict(a, pc, "yes");
    expect(yes.playoff.choice).toBe("playoffs");
    expect(setupConflicts(yes).some((x) => x.id === "playoffs_vs_timeline")).toBe(false);
    const no = resolveConflict(a, pc, "no");
    expect(no.stages.map((s: any) => s.id)).toEqual(["r"]);
    expect(setupConflicts(no)).toEqual([]);
  });
  it("a Final after Semifinals with its own pairing is flagged; resolving uses the semifinal winners", () => {
    const c = setupConflicts({ ...a, playoff: { choice: "playoffs" } });
    expect(c.map((x) => x.id)).toEqual(["pairing_after_f"]);
    const fixed = resolveConflict({ ...a, playoff: { choice: "playoffs" } }, c[0], "yes");
    expect(fixed.stages.find((s: any) => s.id === "f").pairing).toBe("winners");
    expect(setupConflicts(fixed)).toEqual([]);
  });
});
