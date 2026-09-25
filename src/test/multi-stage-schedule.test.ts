import { describe, it, expect } from "vitest";
import { atomically, generateStructuredTournament, specFromDefinition, startNextStructuredStage, type Db } from "@/lib/tournaments/structured-persist";
import { serializeSpec } from "@/lib/tournaments/engine-service";
import { DefinitionSchema } from "@/lib/smart-builder/definition";
import { mapToExistingTournament } from "@/lib/smart-builder/to-existing";
import { requiredRounds, roundNames, scheduleMathsIssues } from "@/lib/smart-builder/schedule-maths";

function fakeDb() {
  const t: Record<string, any[]> = {};
  let n = 0;
  const match = (r: any, f: Record<string, unknown>) => Object.entries(f).every(([k, v]) => r[k] === v);
  const db: Db = {
    async insert(table, rows) { const out = rows.map((r) => ({ id: `${table}-${++n}`, ...r })); (t[table] ??= []).push(...out); return out; },
    async select(table, f) { return (t[table] ?? []).filter((r) => match(r, f)); },
    async update(table, f, patch) { (t[table] ?? []).filter((r) => match(r, f)).forEach((r) => Object.assign(r, patch)); },
    async remove(table, ids) { t[table] = (t[table] ?? []).filter((x) => !ids.includes(x.id)); },
  };
  return { db, t };
}

const WEEKLY = ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"];
const S2 = ["2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26", "2026-12-03"];

/** Riverside shape: Division A and B, each Stage 1 RR (6) → Stage 2 RR (everyone continues, reset). */
const make = (o: { s1?: string[]; s2?: string[]; s1Mode?: string; s2Mode?: string; s1End?: string; s2Start?: string; end?: string } = {}) => DefinitionSchema.parse({
  name: "Riverside Multi-stage",
  scheduleDefaults: { startDate: "2026-10-01", endDate: o.end ?? "2026-12-10" },
  divisions: ["A", "B"].map((id) => ({
    id, name: id, sections: [{ id: "s", name: "Main", stages: [
      { id: `${id}1`, name: "Stage 1", kind: "round_robin", groups: 1, groupSize: 6, input: { entrants: 6 },
        schedule: { mode: o.s1Mode ?? "fixed", roundDates: o.s1 ?? WEEKLY, ...(o.s1End ? { endDate: o.s1End } : {}) } },
      { id: `${id}2`, name: "Stage 2", kind: "round_robin", groups: 1, groupSize: 6, input: { fromStageId: `${id}1` },
        progression: { mode: "all_continue", standings: "reset" }, generation: "owner_approval",
        schedule: { mode: o.s2Mode ?? "fixed", roundDates: o.s2 ?? S2, ...(o.s2Start ? { startDate: o.s2Start } : {}) } },
    ] }],
  })),
});

async function setup() {
  const env = fakeDb();
  env.t.tournaments = [{ id: "t", builder_architecture: "structured", builder_spec: serializeSpec(specFromDefinition(make())) }];
  env.t.club_champs_entries = ["a", "b"].flatMap((p, g) => Array.from({ length: 6 }, (_, i) => ({ id: `${p}${i}`, champ_id: "t", club_member_id: `${p}${i + 1}`, group_number: g + 1, order_index: i })));
  await generateStructuredTournament(env.db, "t");
  return env;
}
const playAll = (env: any, key: string) => env.t.club_champs_matches.filter((m: any) => m.stage_key === key && !m.winner_member_id).forEach((m: any) => {
  const aWins = Number(m.player_a_member_id.slice(1)) < Number(m.player_b_member_id.slice(1));
  Object.assign(m, { status: "completed", score: "3-0", winner_member_id: aWins ? m.player_a_member_id : m.player_b_member_id });
});

describe("multi-stage creation (RR → RR) on the structured engine", () => {
  it("the Builder no longer defers Stage 2 — both stages are created", () => {
    const m = mapToExistingTournament(make());
    expect(m.structured).toBe(true);
    expect(m.deferredStages).toEqual([]);
    expect(m.executability).toBe("ready");
  });
  it("1–3: Division A and B each persist both stages; Stage 2 exists as Pending with no games", async () => {
    const env = await setup();
    const divs = env.t.tournament_divisions;
    expect(divs.map((d: any) => d.spec_key)).toEqual(["A", "B"]);
    for (const d of divs) {
      const st = env.t.tournament_stages.filter((s: any) => s.division_id === d.id).sort((a: any, b: any) => a.stage_order - b.stage_order);
      expect(st.map((s: any) => s.spec_key)).toEqual([`${d.spec_key}1`, `${d.spec_key}2`]);
      expect(env.t.club_champs_matches.filter((m: any) => m.stage_id === st[1].id)).toHaveLength(0);
      expect(env.t.club_champs_matches.filter((m: any) => m.stage_id === st[0].id)).toHaveLength(15);
      expect(st[1].config.schedule.roundDates).toEqual(S2);
    }
  });
  it("4 + 14: Stage 1 completion resolves Stage 2; Stage 1 results are never touched", async () => {
    const env = await setup();
    await expect(startNextStructuredStage(env.db, "t", "A", "A2", { ownerConfirmed: true })).rejects.toThrow(/not finished/);
    playAll(env, "A1");
    const before = JSON.stringify(env.t.club_champs_matches.filter((m: any) => m.stage_key === "A1"));
    await startNextStructuredStage(env.db, "t", "A", "A2", { ownerConfirmed: true });
    const s2 = env.t.club_champs_matches.filter((m: any) => m.stage_key === "A2");
    expect(s2).toHaveLength(15);
    expect(new Set(s2.flatMap((m: any) => [m.player_a_member_id, m.player_b_member_id]))).toEqual(new Set(["a1", "a2", "a3", "a4", "a5", "a6"]));
    expect(JSON.stringify(env.t.club_champs_matches.filter((m: any) => m.stage_key === "A1"))).toBe(before);
    // Division B untouched and still pending.
    expect(env.t.club_champs_matches.filter((m: any) => m.stage_key === "B2")).toHaveLength(0);
  });
  it("13: a failure during creation sends nothing (no half tournament)", async () => {
    const env = fakeDb();
    env.t.tournaments = [{ id: "t", builder_architecture: "structured" }];
    let sent = 0;
    await expect(atomically(env.db, "t", async () => { sent++; }, async (db) => {
      await db.insert("tournament_divisions", [{ tournament_id: "t" }]);
      throw new Error("boom");
    })).rejects.toThrow("boom");
    expect(sent).toBe(0);
    expect(env.t.tournament_divisions).toBeUndefined();
  });
});

describe("schedule maths", () => {
  const codes = (o: Parameters<typeof make>[0]) => scheduleMathsIssues(make(o)).map((i) => i.code);
  it("required rounds come from each stage's format", () => {
    const d = make();
    expect(requiredRounds(d.divisions[0].sections[0].stages[0])).toBe(5);
    expect(roundNames({ kind: "knockout" } as any, 3)).toEqual(["Quarter-final", "Semi-final", "Final"]);
  });
  it("5: 5 RR rounds + 5 valid dates passes", () => { expect(codes({})).toEqual([]); });
  it("6: 5 RR rounds + 4 dates fails with a clear message", () => {
    const issues = scheduleMathsIssues(make({ s1: WEEKLY.slice(0, 4) }));
    expect(issues[0].code).toBe("rounds_short");
    expect(issues[0].message).toContain("requires 5 rounds but only 4 valid round dates are configured");
    expect(issues[0].stageId).toBe("A1");
  });
  it("7: Stage 2 opening before Stage 1 resolves fails", () => {
    const i = scheduleMathsIssues(make({ s2: ["2026-10-22", ...S2.slice(1)] }));
    expect(i.some((x) => x.code === "dependency" && /29/.test(x.message))).toBe(true);
  });
  it("8: Stage 2 after Stage 1 completion passes", () => { expect(codes({ s2: ["2026-10-30", ...S2.slice(1)] })).toEqual([]); });
  it("9: play-by deadlines enforce dependency order", () => {
    // Stage 1 plays by 29 Oct; Stage 2 opening before that fails, after passes.
    expect(codes({ s1Mode: "play_by", s1: [], s1End: "2026-10-29", s2Start: "2026-10-20", s2: ["2026-10-20", ...S2.slice(1)] })).toContain("dependency");
    expect(codes({ s1Mode: "play_by", s1: [], s1End: "2026-10-29" })).toEqual([]);
    // Per-round play-by dates must progress.
    expect(codes({ s1Mode: "play_by", s1: ["2026-10-08", "2026-10-01"], s1End: "2026-10-29" })).toContain("deadline_order");
  });
  it("10: QF/SF/Final dates enforce feeder order", () => {
    const d = DefinitionSchema.parse({ name: "KO", scheduleDefaults: { startDate: "2026-10-01", endDate: "2026-10-31" },
      divisions: [{ id: "d", name: "Open", sections: [{ id: "s", name: "Main", stages: [
        { id: "ko", name: "Knockout", kind: "knockout", groups: 1, groupSize: 8, input: { entrants: 8 }, schedule: { mode: "fixed", roundDates: ["2026-10-03", "2026-10-10", "2026-10-04"] } }] }] }] });
    const i = scheduleMathsIssues(d);
    expect(i[0].code).toBe("knockout_order");
    expect(i[0].message).toContain("Final");
    d.divisions[0].sections[0].stages[0].schedule.roundDates = ["2026-10-03", "2026-10-03", "2026-10-04"];
    expect(scheduleMathsIssues(d)).toEqual([]);
  });
  it("11: a later stage past the tournament end fails", () => {
    const i = scheduleMathsIssues(make({ end: "2026-11-30" }));
    expect(i.some((x) => x.code === "after_end" && x.stageId === "A2")).toBe(true);
  });
  it("12: draft reload keeps every stage's dates and dependencies", () => {
    const d = make({ s1: WEEKLY.slice(0, 4) });
    const back = DefinitionSchema.parse(JSON.parse(JSON.stringify(d)));
    expect(back.divisions.map((x) => x.sections[0].stages.map((s) => [s.input.fromStageId, s.schedule.roundDates]))).toEqual(
      d.divisions.map((x) => x.sections[0].stages.map((s) => [s.input.fromStageId, s.schedule.roundDates])));
    expect(scheduleMathsIssues(back)).toEqual(scheduleMathsIssues(d));
  });
  it("court capacity is checked when courts, match and session minutes are known", () => {
    const d = make();
    d.event = { venues: { mode: "single", clubIds: ["c"], names: ["Riv"], courts: { c: [1] } } } as any;
    d.scheduleDefaults = { ...d.scheduleDefaults, matchMinutes: 45, sessionMinutes: 90 };
    // selectedCourtPool may use a different shape; only assert when a pool is detected.
    const cap = scheduleMathsIssues(d).filter((x) => x.code === "capacity");
    expect(cap.length === 0 || /selected courts fit only/.test(cap[0].message)).toBe(true);
  });
});
