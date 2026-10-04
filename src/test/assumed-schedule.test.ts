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
