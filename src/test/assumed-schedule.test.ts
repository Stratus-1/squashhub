import { describe, it, expect } from "vitest";
import { bellsMinutesFor, allowedCourts, missingAssumptions, planAssumedSchedule, type AssumeGame } from "@/lib/tournaments/assumed-schedule";

const day = { date: "2026-10-10", from: "09:00", to: "12:00", courtIds: [1, 2] };
const g = (id: string, people: string[], doubles = false, unitKey = "Men", round = 1): AssumeGame => ({ id, round, pool: null, unitKey, doubles, people });

describe("planAssumedSchedule", () => {
  it("uses singles/doubles durations, no court or player clash", () => {
    const games = [g("s1", ["a", "b"]), g("d1", ["c", "d", "e", "f"], true), g("s2", ["a", "c"])];
    const r = planAssumedSchedule({ games, days: [day], singles: 30, doubles: 45, rest: 0 });
    expect(r.issues).toEqual([]);
    const at = Object.fromEntries(r.slots.map((s) => [s.id, s]));
    expect(at.s1.time).toBe("09:00");
    expect(at.d1.time).toBe("09:00");
    expect(at.d1.courtId).not.toBe(at.s1.courtId);
    expect(at.s2.time).toBe("09:45"); // c busy until 09:45 in doubles
  });
  it("respects rest and court restrictions", () => {
    const games = [g("s1", ["a", "b"], false, "Ladies"), g("s2", ["a", "c"], false, "Ladies")];
    const r = planAssumedSchedule({ games, days: [day], singles: 30, doubles: 45, rest: 15, rules: [{ key: "Ladies", courtIds: [2] }] });
    expect(r.slots.every((s) => s.courtId === 2)).toBe(true);
    expect(r.slots.find((s) => s.id === "s2")!.time).toBe("09:45");
  });
  it("reports conflicts and writes nothing when it cannot fit", () => {
    const games = Array.from({ length: 20 }, (_, i) => g(`x${i}`, [`p${i}`, `q${i}`]));
    const r = planAssumedSchedule({ games, days: [day], singles: 60, doubles: 60, rest: 0 });
    expect(r.slots).toEqual([]);
    expect(r.issues[0]).toMatch(/could not be placed/);
  });
  it("matches rules by category prefix, round and pool", () => {
    expect(allowedCourts({ unitKey: "Men::A", round: 1, pool: null }, [{ key: "Men", courtIds: [1] }])).toEqual([1]);
    expect(allowedCourts({ unitKey: "Men::A", round: 2, pool: null }, [{ key: "Men", courtIds: [1], round: 1 }])).toBeNull();
  });
  it("lists missing settings", () => {
    const m = missingAssumptions({ days: [{ date: "2026-10-10", courtIds: [], windows: [] }], scheduling: {} }, [{ doubles: false }, { doubles: true }]);
    expect(m.join(" ")).toMatch(/tick which club courts/);
    expect(m.join(" ")).toMatch(/Singles/);
    expect(m.join(" ")).toMatch(/Doubles/);
  });
  it("Bells games use their own slot; Standard uses the estimate (mixed tournament)", () => {
    const plan = { scoring: { mode: "standard" }, scoringOverrides: { Bells: { mode: "time_capped_points", timeCapPlay: "10", timeCapBreak: "3" } } };
    expect(bellsMinutesFor(plan, "Bells::A")).toBe(13);
    expect(bellsMinutesFor(plan, "Men")).toBeNull();
    const games = [{ ...g("b1", ["a", "b"], false, "Bells::A"), bellsMinutes: 13 }, { ...g("b2", ["a", "c"], false, "Bells::A"), bellsMinutes: 13 }, g("s1", ["x", "y"])];
    const r = planAssumedSchedule({ games, days: [{ ...day, courtIds: [1] }], singles: 40, doubles: 50, rest: 0 });
    const at = Object.fromEntries(r.slots.map((s) => [s.id, s.time]));
    expect(at.b1).toBe("09:00"); expect(at.b2).toBe("09:13"); expect(at.s1).toBe("09:26");
  });
  it("does not ask for a Singles/Doubles estimate when every game is Bells", () => {
    const m = missingAssumptions({ days: [{ date: "2026-10-10", courtIds: [1], windows: [{ from: "09:00", to: "12:00" }] }], scheduling: { rest: "0" } }, [{ doubles: false, bellsMinutes: 13 }, { doubles: true, bellsMinutes: 13 }]);
    expect(m).toEqual([]);
  });
});

import { provisionalPlayoffs } from "@/lib/tournaments/provisional-playoffs";
describe("provisional play-offs in the same scheduling run", () => {
  const sfPlan = { playoff: { choice: "playoffs", rounds: 2, pairing: "cross_pools" } };
  it("labels SF crossover then winners into the Final", () => {
    const p = provisionalPlayoffs(sfPlan, "Men", 2).map((x) => x.label);
    expect(p).toEqual(["SF1: Pool A #1 v Pool B #2", "SF2: Pool B #1 v Pool A #2", "Final: Winner SF1 v Winner SF2"]);
  });
  it("uses per-stage timeline pairing instead of hard-coding crossover", () => {
    const p = provisionalPlayoffs({ stages: [{ name: "Semifinal", unit: "Men", phase: "playoff", pairing: "seeded" }, { name: "Final", unit: "Men", phase: "playoff", pairing: "winners" }] }, "Men", 2);
    expect(p[0].label).toBe("SF1: Seed 1 v Seed 4");
  });
  it("placement and no-playoff choices", () => {
    expect(provisionalPlayoffs({ playoff: { choice: "playoffs", style: "placement" }, playoffPoolQualifiers: { Men: { perPool: "3" } } }, "Men", 2)).toHaveLength(3);
    expect(provisionalPlayoffs({ playoff: { choice: "none" } }, "Men", 2)).toEqual([]);
  });
  const q = (id: string, ppl: string[], round: number): AssumeGame => ({ id, round, pool: 1, unitKey: "Men", doubles: false, people: ppl, phase: 0 });
  const po = (id: string, phase: number): AssumeGame => ({ id, round: 1, pool: null, unitKey: "Men", doubles: false, people: [], phase, provisional: true });
  it("SFs start gap after last qualifier; Final after SFs + rest", () => {
    const r = planAssumedSchedule({ games: [q("a", ["1", "2"], 1), q("b", ["3", "4"], 1), po("sf1", 11), po("sf2", 11), po("f", 12)], days: [day], singles: 30, doubles: 30, rest: 10, playoffStart: { mode: "after", gap: 30 } });
    const at = Object.fromEntries(r.slots.map((s) => [s.id, s.time]));
    expect(at.a).toBe("09:00"); expect(at.sf1).toBe("10:00"); expect(at.sf2).toBe("10:00"); expect(at.f).toBe("10:40");
  });
  it("fixed playoff start reserves the window and keeps qualifiers before it", () => {
    const r = planAssumedSchedule({ games: [q("a", ["1", "2"], 1), po("f", 11)], days: [day], singles: 30, doubles: 30, rest: 0, playoffStart: { mode: "fixed", date: day.date, time: "11:00" } });
    expect(r.slots.find((s) => s.id === "f")?.time).toBe("11:00");
  });
  it("warns instead of dropping play-offs when capacity runs out", () => {
    const r = planAssumedSchedule({ games: [q("a", ["1", "2"], 1), po("f", 11)], days: [{ ...day, to: "09:45" }], singles: 30, doubles: 30, rest: 0, playoffStart: { mode: "after", gap: 0 } });
    expect(r.slots).toEqual([]); expect(r.issues[0]).toMatch(/play-off/);
  });
  it("spread pacing spaces qualifying rounds", () => {
    const r = planAssumedSchedule({ games: [q("a", ["1", "2"], 1), q("b", ["1", "2"], 2)], days: [day], singles: 30, doubles: 30, rest: 0, pace: "spread" });
    expect(r.slots.find((s) => s.id === "b")?.time).toBe("10:30");
  });
});

import { adoptionPlan, playoffAbbr } from "@/lib/tournaments/assumed-schedule";
describe("whole-weekend play-off scenarios", () => {
  const q = (id: string, ppl: string[], round: number, unitKey = "Men", doubles = false): AssumeGame => ({ id, round, pool: 1, unitKey, doubles, people: ppl, phase: 0 });
  const po = (id: string, phase: number, unitKey = "Men"): AssumeGame => ({ id, round: 1, pool: null, unitKey, doubles: false, people: [], phase, provisional: true });
  const fri = { date: "2026-10-09", from: "18:00", to: "21:00", courtIds: [1, 2] };
  const sat = { date: "2026-10-10", from: "09:00", to: "17:00", courtIds: [1, 2] };
  it("pools -> QF -> SF -> Final across Friday and Saturday, each stage after the previous", () => {
    const games = [q("a", ["1", "2"], 1), q("b", ["3", "4"], 1), ...[1, 2, 3, 4].map((i) => po(`qf${i}`, 11)), po("sf1", 12), po("sf2", 12), po("f", 13)];
    const r = planAssumedSchedule({ games, days: [fri, sat], singles: 45, doubles: 45, rest: 15, playoffStart: { mode: "fixed", date: "2026-10-10", time: "09:00" } });
    expect(r.issues).toEqual([]);
    const at = Object.fromEntries(r.slots.map((s) => [s.id, `${s.date} ${s.time}`]));
    expect(at.a.startsWith("2026-10-09")).toBe(true);
    expect(at.qf1).toBe("2026-10-10 09:00"); expect(at.qf3).toBe("2026-10-10 10:00");
    expect(at.sf1).toBe("2026-10-10 11:00"); expect(at.f).toBe("2026-10-10 12:00");
    expect(provisionalPlayoffs({ playoff: { choice: "playoffs", rounds: 3, pairing: "cross_pools" } }, "Men", 2)).toHaveLength(7);
  });
  it("compact finishes earlier than spread", () => {
    const games = [1, 2, 3].map((r) => q(`r${r}`, ["1", "2"], r));
    const c = planAssumedSchedule({ games, days: [sat], singles: 30, doubles: 30, rest: 0, pace: "fast" });
    const s = planAssumedSchedule({ games, days: [sat], singles: 30, doubles: 30, rest: 0, pace: "spread" });
    expect(c.slots.find((x) => x.id === "r3")!.time < s.slots.find((x) => x.id === "r3")!.time).toBe(true);
  });
  it("a player in both Singles and Doubles never overlaps and gets rest", () => {
    const r = planAssumedSchedule({ games: [q("s", ["p", "x"], 1, "Singles"), q("d", ["p", "y", "z", "w"], 1, "Doubles", true)], days: [sat], singles: 30, doubles: 40, rest: 20 });
    const at = Object.fromEntries(r.slots.map((x) => [x.id, x.time]));
    expect(at.s).toBe("09:00"); expect(at.d).toBe("09:50");
  });
  it("real play-off rows take over their reserved slots in bracket order (no players invented)", () => {
    expect(playoffAbbr("playoff_sf", "League 1 · Semi-final")).toBe("SF");
    expect(playoffAbbr("playoff_final", "Pos 1 · 1st/2nd Place Play-off")).toBe("place");
    expect(playoffAbbr("group", "A1 v B1")).toBeNull();
    const pre = "sbs:T:po:";
    const holds = [{ id: "h1", externalId: `${pre}Men|SF|1`, date: "2026-10-10", start: "11:00", courtId: 1 }, { id: "h2", externalId: `${pre}Men|SF|2`, date: "2026-10-10", start: "11:00", courtId: 2 }, { id: "h3", externalId: `${pre}Men|Final|1`, date: "2026-10-10", start: "12:00", courtId: 1 }];
    const plan = adoptionPlan("T", holds, [{ id: "m2", unitKey: "Men", abbr: "SF", order: 2 }, { id: "m1", unitKey: "Men", abbr: "SF", order: 1 }]);
    expect(plan.map((p) => [p.rowId, p.hold.id])).toEqual([["m1", "h1"], ["m2", "h2"]]);
  });
});
