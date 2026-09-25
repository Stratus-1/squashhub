import { describe, it, expect } from "vitest";
import { DefinitionSchema, parseDefinition } from "@/lib/smart-builder/definition";
import { recurringDates, requiredRounds, roundDatePlan, roundNames, scheduleMathsIssues, syncDerivedRoundDates } from "@/lib/smart-builder/schedule-maths";
import { generateStructuredTournament, specFromDefinition, type Db } from "@/lib/tournaments/structured-persist";
import { serializeSpec } from "@/lib/tournaments/engine-service";

function fakeDb() {
  const t: Record<string, any[]> = {};
  let n = 0;
  const match = (r: any, f: Record<string, unknown>) => Object.entries(f).every(([k, v]) => r[k] === v);
  const db: Db = {
    async insert(table, rows) { const out = rows.map((r) => ({ id: `${table}-${++n}`, ...r })); (t[table] ??= []).push(...out); return out; },
    async select(table, f) { return (t[table] ?? []).filter((r) => match(r, f)); },
    async update(table, f, patch) { (t[table] ?? []).filter((r) => match(r, f)).forEach((r) => Object.assign(r, patch)); },
  };
  return { db, t };
}

const WED = 3;
const make = (stage: Record<string, unknown>, extra: Record<string, unknown> = {}) => DefinitionSchema.parse({
  name: "Derived",
  scheduleDefaults: { startDate: "2026-10-07", endDate: "2026-12-31", weekday: WED },
  divisions: [{ id: "d", name: "Open", sections: [{ id: "s", name: "Main", stages: [
    { id: "s1", name: "Stage 1", kind: "round_robin", groups: 1, groupSize: 6, input: { entrants: 6 }, schedule: { mode: "fixed" }, ...stage },
  ] }] }],
  ...extra,
});

describe("derived round counts", () => {
  it("6-player single round robin = 5 rounds", () => {
    expect(requiredRounds(make({}).divisions[0].sections[0].stages[0])).toBe(5);
  });
  it("odd round robin adds a bye round (5 players = 5 rounds; double RR = 10)", () => {
    const st = make({ groupSize: 5, input: { entrants: 5 } }).divisions[0].sections[0].stages[0];
    expect(requiredRounds(st)).toBe(5);
    expect(requiredRounds({ ...st, legs: 2 } as any)).toBe(10);
  });
  it("unequal pools: the biggest pool drives the round slots (14 over 3 pools → pool of 5 → 5 rounds)", () => {
    const st = make({ groups: 3, groupSize: null, input: { entrants: 14 } }).divisions[0].sections[0].stages[0];
    expect(requiredRounds(st)).toBe(5);
  });
  it("Swiss uses the owner's explicit round count", () => {
    const st = make({ kind: "swiss", swissRounds: 4, groupSize: 16, input: { entrants: 16 } }).divisions[0].sections[0].stages[0];
    expect(requiredRounds(st)).toBe(4);
  });
  it("8-player knockout = QF, SF, Final", () => {
    const st = make({ kind: "knockout", groupSize: 8, input: { entrants: 8 } }).divisions[0].sections[0].stages[0];
    expect(requiredRounds(st)).toBe(3);
    expect(roundNames(st, 3)).toEqual(["Quarter-final", "Semi-final", "Final"]);
  });
  it("later stage derives its size from what the earlier stage sends (4 pools × top 2 → 8 → 3 KO rounds)", () => {
    const def = DefinitionSchema.parse({
      name: "x", scheduleDefaults: { startDate: "2026-10-07", endDate: "2026-12-31", weekday: WED },
      divisions: [{ id: "d", name: "Open", sections: [{ id: "s", name: "Main", stages: [
        { id: "p", name: "Pools", kind: "round_robin", groups: 4, groupSize: 4, input: { entrants: 16 }, advance: { role: "qualify", perGroup: 2 }, schedule: { mode: "fixed" } },
        { id: "k", name: "KO", kind: "knockout", groups: 1, input: { fromStageId: "p" }, progression: { mode: "top_n", top: 2, perPool: true }, schedule: { mode: "fixed" } },
      ] }] }],
    });
    expect(requiredRounds(def.divisions[0].sections[0].stages[1], def)).toBe(3);
    syncDerivedRoundDates(def);
    // Pools: 3 rounds 7,14,21 Oct → KO starts the next Wednesday.
    expect(def.divisions[0].sections[0].stages[1].schedule.roundDates).toEqual(["2026-10-28", "2026-11-04", "2026-11-11"]);
  });
});

describe("derived round dates", () => {
  it("weekly recurrence creates exactly the derived dates", () => {
    const def = make({});
    syncDerivedRoundDates(def);
    expect(def.divisions[0].sections[0].stages[0].schedule.roundDates).toEqual(["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28", "2026-11-04"]);
    expect(scheduleMathsIssues(def)).toEqual([]);
    expect(recurringDates("2026-10-05", WED, 2)).toEqual(["2026-10-07", "2026-10-14"]);
  });
  it("per-round override replaces only that round", () => {
    const def = make({ schedule: { mode: "fixed", roundDateOverrides: { "2": "2026-10-22" } } });
    syncDerivedRoundDates(def);
    expect(def.divisions[0].sections[0].stages[0].schedule.roundDates![2]).toBe("2026-10-22");
    expect(def.divisions[0].sections[0].stages[0].schedule.roundDates![3]).toBe("2026-10-28");
  });
  it("changing pool size recalculates without stale extra rounds or overrides", () => {
    const def = make({ schedule: { mode: "fixed", roundDateOverrides: { "4": "2026-11-05" } } });
    syncDerivedRoundDates(def);
    const st = def.divisions[0].sections[0].stages[0];
    expect(st.schedule.roundDates).toHaveLength(5);
    st.groupSize = 4; st.input = { entrants: 4 };
    syncDerivedRoundDates(def);
    expect(st.schedule.roundDates).toEqual(["2026-10-07", "2026-10-14", "2026-10-21"]);
    expect(st.schedule.roundDateOverrides).toBeUndefined();
  });
  it("autosave/reload preserves the generated dates and overrides", () => {
    const def = make({ schedule: { mode: "fixed", roundDateOverrides: { "1": "2026-10-15" } } });
    syncDerivedRoundDates(def);
    const back = parseDefinition(JSON.parse(JSON.stringify(def)));
    expect(back.ok).toBe(true);
    const st = (back as any).value.divisions[0].sections[0].stages[0];
    expect(st.schedule.roundDates).toEqual(def.divisions[0].sections[0].stages[0].schedule.roundDates);
    expect(st.schedule.roundDateOverrides).toEqual({ "1": "2026-10-15" });
    expect(roundDatePlan((back as any).value).get("s1")!.dates).toEqual(st.schedule.roundDates);
  });
  it("Create persists the dates and every generated game gets its round's date", async () => {
    const def = make({});
    syncDerivedRoundDates(def);
    const spec = specFromDefinition(def);
    expect(spec.divisions[0].stages[0].schedule?.roundDates).toHaveLength(5);
    const { db, t } = fakeDb();
    t.tournaments = [{ id: "T", builder_architecture: "structured", builder_spec: serializeSpec(spec), start_date: "2026-10-07", end_date: "2026-12-31" }];
    t.club_champs_entries = Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, champ_id: "T", group_number: 1, club_member_id: `m${i}`, order_index: i }));
    await generateStructuredTournament(db, "T");
    const byRound = new Map<number, Set<string>>();
    for (const m of t.club_champs_matches) (byRound.get(m.round_number) ?? byRound.set(m.round_number, new Set()).get(m.round_number)!).add(m.scheduled_date);
    expect([...byRound.keys()].sort()).toEqual([1, 2, 3, 4, 5]);
    expect([1, 2, 3, 4, 5].map((r) => [...byRound.get(r)!])).toEqual([["2026-10-07"], ["2026-10-14"], ["2026-10-21"], ["2026-10-28"], ["2026-11-04"]]);
  });
});

describe("knockout round names on Beta games", () => {
  it("an 8-player knockout's first round is labelled Quarter-final", async () => {
    const def = make({ kind: "knockout", groupSize: 8, input: { entrants: 8 } });
    syncDerivedRoundDates(def);
    const spec = specFromDefinition(def);
    const { db, t } = fakeDb();
    t.tournaments = [{ id: "T", builder_architecture: "structured", builder_spec: serializeSpec(spec), start_date: "2026-10-07", end_date: "2026-12-31" }];
    t.club_champs_entries = Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, champ_id: "T", group_number: 1, club_member_id: `m${i}`, order_index: i }));
    await generateStructuredTournament(db, "T");
    const r1 = t.club_champs_matches.filter((m: any) => m.round_number === 1);
    expect(new Set(r1.map((m: any) => m.stage_label))).toEqual(new Set(["Quarter-final"]));
    expect(r1.every((m: any) => m.scheduled_date === "2026-10-07")).toBe(true);
  });
});
