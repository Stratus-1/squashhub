import { describe, it, expect } from "vitest";
import { fixtureDateIssue, resolveSpecDates, specDateIssues, stageWindow, windowChangeImpact } from "@/lib/tournaments/date-window";
import type { TournamentSpec, SpecDivision } from "@/lib/tournaments/engine-service";
import type { PlannedStage } from "@/lib/tournaments/contract";
import { DefinitionSchema } from "@/lib/smart-builder/definition";
import { definitionDateIssues, stageWindowOf } from "@/lib/smart-builder/dates";
import { generateStructuredTournament, specFromDefinition, type Db } from "@/lib/tournaments/structured-persist";
import { serializeSpec } from "@/lib/tournaments/engine-service";

const TW = { start: "2026-09-28", end: "2026-10-05" };
const stage = (id: string, order: number, schedule: PlannedStage["schedule"], kind: PlannedStage["kind"] = "pools"): PlannedStage =>
  ({ id, order, kind, name: id, pools: kind === "pools" ? 2 : undefined, poolSize: 4, schedule } as PlannedStage);
const spec = (stages: PlannedStage[]): TournamentSpec => ({
  version: 1, architecture: "structured", name: "T",
  divisions: [{ divisionId: "men", label: "Men", unit: "players", expectedEntrants: 8, seeding: { source: "entry_order", method: "snake" }, placements: "champion", stages, entrants: [] } as SpecDivision],
});

describe("canonical tournament window", () => {
  it("inheriting stages follow tournament date changes; explicit overrides stay put", () => {
    const s = spec([stage("pools", 0, { rule: "play_by" }), stage("ko", 1, { rule: "fixed", start: "2026-10-03", end: "2026-10-05" }, "knockout")]);
    expect(stageWindow(s.divisions[0].stages[0], TW)).toMatchObject({ start: "2026-09-28", end: "2026-10-05", inherits: true });
    const moved = { start: "2026-09-29", end: "2026-10-06" };
    expect(stageWindow(s.divisions[0].stages[0], moved)).toMatchObject({ start: "2026-09-29", end: "2026-10-06" });
    expect(stageWindow(s.divisions[0].stages[1], moved)).toMatchObject({ start: "2026-10-03", end: "2026-10-05", inherits: false });
    const r = resolveSpecDates(s, moved);
    expect(r.divisions[0].stages[0].schedule.deadline).toBe("2026-10-06");
    expect(r.divisions[0].stages[1].schedule.date).toBe("2026-10-03");
  });

  it("a stage window outside the tournament is flagged, with an extend suggestion", () => {
    const i = specDateIssues(spec([stage("ko", 0, { rule: "fixed", start: "2026-10-03", end: "2026-10-07" })]), TW);
    expect(i[0]).toMatchObject({ code: "stage_outside", extendTo: { start: "2026-09-28", end: "2026-10-07" } });
  });

  it("a fixed round outside the stage window is blocked", () => {
    const i = specDateIssues(spec([stage("ko", 0, { rule: "fixed", start: "2026-10-03", end: "2026-10-05", date: "2026-10-01" })]), TW);
    expect(i.map((x) => x.code)).toContain("round_outside");
  });

  it("a play-by deadline outside the stage window is blocked", () => {
    const i = specDateIssues(spec([stage("pools", 0, { rule: "play_by", start: "2026-09-28", end: "2026-10-02", deadline: "2026-10-04" })]), TW);
    expect(i.map((x) => x.code)).toContain("deadline_outside");
  });

  it("fixture dates must fit round, stage and tournament", () => {
    const s = spec([stage("pools", 0, { rule: "play_by", start: "2026-09-28", end: "2026-10-02", deadline: "2026-10-01" })]);
    expect(fixtureDateIssue(s, TW, "men", "pools", "2026-09-30")).toBeNull();
    expect(fixtureDateIssue(s, TW, "men", "pools", "2026-10-02")?.message).toMatch(/play-by/);
    expect(fixtureDateIssue(s, TW, "men", "pools", "2026-10-04")?.message).toMatch(/stage window/);
    expect(fixtureDateIssue(s, TW, "men", "pools", "2026-10-09")?.message).toMatch(/tournament dates/);
  });

  it("shrinking the tournament window reports what would fall outside", () => {
    const s = spec([stage("pools", 0, { rule: "play_by" }), stage("ko", 1, { rule: "fixed", start: "2026-10-03", end: "2026-10-05" }, "knockout")]);
    const impact = windowChangeImpact(s, { start: "2026-09-28", end: "2026-10-03" }, [{ divisionId: "men", stageId: "pools", date: "2026-10-02" }]);
    expect(impact.some((m) => m.includes("ko") && m.includes("2026-10-05"))).toBe(true);
    expect(windowChangeImpact(s, TW, [])).toEqual([]);
  });

  it("the editor reopens exactly the persisted stage schedule — no tournament range stored in the spec", () => {
    const s = spec([stage("pools", 0, { rule: "play_by" })]);
    const again = serializeSpec(JSON.parse(JSON.stringify(s)));
    expect(again.divisions[0].stages[0].schedule).toEqual({ rule: "play_by" });
    expect((again as any).window).toBeUndefined();
  });
});

/* ───── builder + generation use ONE range ───── */

const def = (sd: Record<string, string>, stageSched: Record<string, unknown> = {}) => DefinitionSchema.parse({
  name: "Dated", scheduleDefaults: sd,
  divisions: [{ id: "men", name: "Men", sections: [{ id: "s", name: "Main", stages: [
    { id: "rr", name: "Round robin", kind: "round_robin", groups: 1, groupSize: 4, input: { entrants: 4 }, schedule: { mode: "play_by", ...stageSched } },
  ] }] }],
});

function fakeDb(row: Record<string, unknown>) {
  const t: Record<string, any[]> = { tournaments: [row] };
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

describe("builder dates", () => {
  it("the spec stores no tournament range; inheriting stages keep NULL dates", () => {
    const s = specFromDefinition(def({ startDate: "2026-09-28", endDate: "2026-10-05" }));
    expect(s.divisions[0].stages[0].schedule).toMatchObject({ rule: "play_by", start: null, end: null, deadline: null });
    expect(JSON.stringify(s)).not.toContain("2026-09-28");
  });

  it("generation reads the one tournament row range", async () => {
    const s = specFromDefinition(def({ startDate: "2026-09-28", endDate: "2026-10-05" }));
    const { db, t } = fakeDb({ id: "t", builder_architecture: "structured", builder_spec: s, start_date: "2026-09-28", end_date: "2026-10-05" });
    t.club_champs_entries = Array.from({ length: 4 }, (_, i) => ({ id: `e${i}`, champ_id: "t", club_member_id: `m${i}`, group_number: 1, order_index: i }));
    await generateStructuredTournament(db, "t");
    const st = t.tournament_stages[0];
    expect(st.config.schedule.start).toBeNull(); // persisted structure keeps inheritance, not a copy
  });

  it("generation refuses a stage outside the tournament row range", async () => {
    const s = specFromDefinition(def({}, { startDate: "2026-10-01", endDate: "2026-10-09" }));
    const { db, t } = fakeDb({ id: "t", builder_architecture: "structured", builder_spec: s, start_date: "2026-09-28", end_date: "2026-10-05" });
    t.club_champs_entries = Array.from({ length: 4 }, (_, i) => ({ id: `e${i}`, champ_id: "t", club_member_id: `m${i}`, group_number: 1, order_index: i }));
    await expect(generateStructuredTournament(db, "t")).rejects.toThrow(/outside the tournament dates/);
  });

  it("builder flags and refuses a stage window outside the tournament dates", () => {
    const d = def({ startDate: "2026-09-28", endDate: "2026-10-05" }, { startDate: "2026-10-01", endDate: "2026-10-09" });
    expect(definitionDateIssues(d)[0].code).toBe("stage_outside");
    expect(() => specFromDefinition(d)).toThrow(/outside the tournament dates/);
    const inherit = def({ startDate: "2026-09-28", endDate: "2026-10-05" });
    expect(stageWindowOf(inherit, inherit.divisions[0].sections[0].stages[0])).toMatchObject({ inherits: true, end: "2026-10-05" });
  });

  it("legacy tournaments are untouched (no spec, no date checks)", () => {
    expect(definitionDateIssues(def({}))).toEqual([]);
  });
});
