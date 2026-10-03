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
    const plan = { days: [{ date: "2026-10-06", courtIds: [20, 21, 24], windows: [{ from: "18:00", to: "21:00" }] }] };
    expect(planDays(plan)).toEqual([{ date: "2026-10-06", from: "18:00", to: "21:00", courtIds: [20, 21, 24] }]);
  });
});

describe("player collisions", () => {
  it("never puts a player on two courts in the same slot", () => {
    const players = { a: ["p1", "p2"], b: ["p1", "p3"], c: ["p4", "p5"] };
    const r = planTimedRounds({ rounds: [{ round: 1, games: ["a", "b", "c"] }], days: [{ date: "2026-10-06", from: "18:00", to: "21:00", courtIds: [1, 2, 3] }], minutes: 30, waves: true, players });
    const ta = r.slots.find((s) => s.id === "a")!.time, tb = r.slots.find((s) => s.id === "b")!.time;
    expect(ta).not.toBe(tb);
    const blocked = planTimedRounds({ rounds: [{ round: 1, games: ["a", "b"] }], days: [{ date: "2026-10-06", from: "18:00", to: "21:00", courtIds: [1, 2, 3] }], minutes: 30, players });
    expect(blocked.slots).toEqual([]); expect(blocked.issues[0]).toMatch(/two games/);
  });
  it("explains total capacity for the 6th/7th case", () => {
    const g = (r: number) => Array.from({ length: 6 }, (_, i) => `r${r}g${i}`);
    const r = planTimedRounds({ rounds: [1, 2, 3, 4, 5, 6].map((n) => ({ round: n, games: g(n) })), days: [{ date: "2026-10-06", from: "18:00", to: "21:00", courtIds: [20, 21, 24] }], minutes: 30 });
    expect(r.slots).toEqual([]); expect(r.issues[0]).toMatch(/36 games need 36 court slots but only 18 fit/);
  });
});

import { planBellsWaves, bellsSlotMinutes } from "@/lib/tournaments/formal-stage-schedule";
describe("Bells waves", () => {
  // Full 6x6 cross-league: round k pairs A(i) with B((i+k) % 6).
  const rounds = Array.from({ length: 6 }, (_, k) => ({ round: k + 1, games: Array.from({ length: 6 }, (_, i) => `A${i}-B${(i + k) % 6}`) }));
  const players = Object.fromEntries(rounds.flatMap((r) => r.games).map((id) => [id, id.split("-")]));
  const noClash = (slots: any[]) => { const seen = new Set<string>(); for (const s of slots) for (const p of players[s.id]) { const k = `${s.date}${s.time}${p}`; if (seen.has(k)) return false; seen.add(k); } return true; };
  it("3 courts: a 6-game round spans two bells, no per-round court error", () => {
    const r = planBellsWaves({ rounds: rounds.slice(0, 1), days: [{ date: "2026-10-06", from: "18:00", to: "21:00", courtIds: [20, 21, 24] }], minutes: 15, players });
    expect(r.issues).toEqual([]);
    expect([...new Set(r.slots.map((s) => s.time))]).toEqual(["18:00", "18:15"]);
  });
  it("4 courts: 4 then 2", () => {
    const r = planBellsWaves({ rounds: rounds.slice(0, 1), days: [{ date: "2026-10-06", from: "18:00", to: "21:00", courtIds: [1, 2, 3, 4] }], minutes: 20, players });
    expect(r.slots.filter((s) => s.time === "18:00")).toHaveLength(4);
    expect(r.slots.filter((s) => s.time === "18:20")).toHaveLength(2);
  });
  it("all 36 games on 3 courts with 15-min bells fit exactly, no player clash, no court double-booking", () => {
    const r = planBellsWaves({ rounds, days: [{ date: "2026-10-06", from: "18:00", to: "21:00", courtIds: [20, 21, 24] }], minutes: 15, players });
    expect(r.issues).toEqual([]); expect(r.slots).toHaveLength(36); expect(noClash(r.slots)).toBe(true);
    const cells = r.slots.map((s) => `${s.time}${s.courtId}`); expect(new Set(cells).size).toBe(36);
  });
  it("reports capacity only after packing everything (30-min bells, one 3h evening)", () => {
    const r = planBellsWaves({ rounds, days: [{ date: "2026-10-06", from: "18:00", to: "21:00", courtIds: [20, 21, 24] }], minutes: 30, players });
    expect(r.slots).toEqual([]); expect(r.issues[0]).toMatch(/36 games need a bell slot but only 18 could be placed/);
    expect(r.issues.join(" ")).not.toMatch(/start together/);
  });
  it("continues onto a second date with its own courts", () => {
    const r = planBellsWaves({ rounds, days: [{ date: "2026-10-06", from: "18:00", to: "21:00", courtIds: [20, 21, 24] }, { date: "2026-10-13", from: "18:00", to: "21:00", courtIds: [20, 21, 24, 25] }], minutes: 30, players });
    expect(r.issues).toEqual([]); expect(r.slots.filter((s) => s.date === "2026-10-13").length).toBe(18);
    expect(r.slots.filter((s) => s.date === "2026-10-06").every((s) => [20, 21, 24].includes(s.courtId))).toBe(true);
    expect(noClash(r.slots)).toBe(true);
  });
  it("bell slot = play + changeover", () => {
    expect(bellsSlotMinutes({ mode: "time_capped_points", timeCapPlay: "12", timeCapBreak: "3" })).toBe(15);
    expect(bellsSlotMinutes({ mode: "standard" })).toBeNull();
  });
});

describe("Bells 10 + 3 = 13 minute slots", () => {
  it("uses play + changeover from the saved setup and schedules all 36 on 3 courts at 13-min bells", () => {
    const m = bellsSlotMinutes({ mode: "time_capped_points", timeCapPlay: "10", timeCapBreak: "3" })!;
    expect(m).toBe(13);
    const rounds = Array.from({ length: 6 }, (_, k) => ({ round: k + 1, games: Array.from({ length: 6 }, (_, i) => `A${i}-B${(i + k) % 6}`) }));
    const players = Object.fromEntries(rounds.flatMap((r) => r.games).map((id) => [id, id.split("-")]));
    const r = planBellsWaves({ rounds, days: [{ date: "2026-10-06", from: "18:00", to: "21:00", courtIds: [20, 21, 24] }], minutes: m, players });
    expect(r.issues).toEqual([]); expect(r.available).toBe(39); expect(r.slots).toHaveLength(36);
    expect([...new Set(r.slots.map((s) => s.time))].slice(0, 3)).toEqual(["18:00", "18:13", "18:26"]);
  });
});

describe("validator and allocator agree (13-min Bells)", () => {
  it("re-running the same plan as a dry-run check after assignment raises no capacity issue", () => {
    const m = bellsSlotMinutes({ mode: "time_capped_points", timeCapPlay: "10", timeCapBreak: "3" })!;
    const rounds = Array.from({ length: 6 }, (_, k) => ({ round: k + 1, games: Array.from({ length: 6 }, (_, i) => `A${i}-B${(i + k) % 6}`) }));
    const players = Object.fromEntries(rounds.flatMap((r) => r.games).map((id) => [id, id.split("-")]));
    const days = [{ date: "2026-10-06", from: "18:00", to: "21:00", courtIds: [20, 21, 24] }];
    const alloc = planBellsWaves({ rounds, days, minutes: m, players });
    const check = planBellsWaves({ rounds, days, minutes: m, players });
    expect(alloc.issues).toEqual([]); expect(check.issues).toEqual([]);
    expect(alloc.slots.filter((s) => s.time === "18:00")).toHaveLength(3);
    expect(alloc.slots.filter((s) => s.time === "18:13")).toHaveLength(3);
  });
});
