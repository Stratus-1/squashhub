import { describe, it, expect } from "vitest";
import { allowedCourts, missingAssumptions, planAssumedSchedule, type AssumeGame } from "@/lib/tournaments/assumed-schedule";

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
});
