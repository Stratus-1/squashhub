import { describe, it, expect } from "vitest";
import { planTimedRounds, planDays } from "@/lib/tournaments/formal-stage-schedule";

const g = (r: number, n: number) => Array.from({ length: n }, (_, i) => `r${r}g${i + 1}`);
const day = (date: string, from = "18:00", to = "21:00", courtIds = [1, 2, 3]) => ({ date, from, to, courtIds });

describe("timed round sessions (Bells / fixed dates)", () => {
  it("multiple rounds on one evening start at sequential bell times from the configured duration", () => {
    const r = planTimedRounds({ rounds: [1, 2, 3].map((n) => ({ round: n, games: g(n, 3) })), days: [day("2026-10-06")], minutes: 20 });
    expect(r.issues).toEqual([]);
    const times = (n: number) => [...new Set(r.slots.filter((s) => s.round === n).map((s) => s.time))];
    expect(times(1)).toEqual(["18:00"]); expect(times(2)).toEqual(["18:20"]); expect(times(3)).toEqual(["18:40"]);
    expect(r.slots.filter((s) => s.round === 1).map((s) => s.courtId)).toEqual([1, 2, 3]);
  });
  it("uses the actual bells duration plus buffer, never a hard-coded length", () => {
    const r = planTimedRounds({ rounds: [{ round: 1, games: g(1, 2) }, { round: 2, games: g(2, 2) }], days: [day("2026-10-06")], minutes: 12, bufferMinutes: 3 });
    expect(r.slots.find((s) => s.round === 2)!.time).toBe("18:15");
  });
  it("blocks when a round has more simultaneous games than courts (no waves)", () => {
    const r = planTimedRounds({ rounds: [{ round: 1, games: g(1, 6) }], days: [day("2026-10-06")], minutes: 30 });
    expect(r.slots).toEqual([]);
    expect(r.issues[0]).toMatch(/6 games .* only 3 courts/);
  });
  it("6x6 cross-league on 3 courts, 18:00-21:00, 30 min does not fit and writes nothing", () => {
    const r = planTimedRounds({ rounds: [1, 2, 3, 4, 5, 6].map((n) => ({ round: n, games: g(n, 6) })), days: [day("2026-10-06")], minutes: 30, waves: true });
    expect(r.slots).toEqual([]); expect(r.required).toBe(36); expect(r.available).toBe(18);
  });
  it("waves play a large round in consecutive bell slots when configured", () => {
    const r = planTimedRounds({ rounds: [{ round: 1, games: g(1, 6) }, { round: 2, games: g(2, 3) }], days: [day("2026-10-06")], minutes: 30, waves: true });
    expect(r.issues).toEqual([]);
    expect([...new Set(r.slots.filter((s) => s.round === 1).map((s) => s.time))]).toEqual(["18:00", "18:30"]);
    expect(r.slots.find((s) => s.round === 2)!.time).toBe("19:00");
  });
  it("rolls rounds to the next configured date and honours explicit round dates", () => {
    const days = [day("2026-10-06", "18:00", "19:00"), day("2026-10-13", "18:00", "19:00")];
    const r = planTimedRounds({ rounds: [1, 2, 3].map((n) => ({ round: n, games: g(n, 3) })), days, minutes: 30 });
    expect(r.slots.filter((s) => s.round === 3).every((s) => s.date === "2026-10-13" && s.time === "18:00")).toBe(true);
    const e = planTimedRounds({ rounds: [{ round: 1, games: g(1, 3) }, { round: 2, date: "2026-10-13", games: g(2, 3) }], days, minutes: 30 });
    expect(e.slots.filter((s) => s.round === 2).every((s) => s.date === "2026-10-13")).toBe(true);
  });
  it("avoids collisions with already occupied courts/times", () => {
    const r = planTimedRounds({ rounds: [{ round: 1, games: g(1, 3) }], days: [day("2026-10-06")], minutes: 30, busy: [{ date: "2026-10-06", courtId: 2, start: "18:00", end: "18:30" }] });
    expect(r.slots.every((s) => s.time === "18:30")).toBe(true);
    const keys = r.slots.map((s) => `${s.date}${s.time}${s.courtId}`); expect(new Set(keys).size).toBe(keys.length);
  });
  it("reads each day's own selected courts from the plan", () => {
    expect(planDays({ days: [{ date: "2026-10-06", courtIds: [20, 21, 24], windows: [{ from: "18:00", to: "21:00" }] }])).toEqual([{ date: "2026-10-06", from: "18:00", to: "21:00", courtIds: [20, 21, 24] }]);
  });
});
