import { describe, it, expect } from "vitest";
import { resolveTimedFormat, planTimedSchedule, type TimedGame } from "@/lib/tournaments/formal-stage-schedule";
import { DEFAULT_SCHEDULING_PREFS } from "@/lib/tournaments/scheduling-prefs";

const labels = { "1": "Men A", "2": "Ladies A" };
const bells = { mode: "time_capped_points", timeCapPlay: 10, timeCapBreak: 3 };
const std = { mode: "standard" };

describe("timed scheduler play format (no Bells leakage)", () => {
  it("all-Standard => no Bells logic, Standard estimate used", () => {
    const f = resolveTimedFormat({ plan: { scoring: std, scheduling: { singles: 40 } }, labels, rulesMode: null, matchMinutes: 45 });
    expect(f.bells).toBe(false); expect(f.mixed).toBe(false); expect(f.minutes).toBe(40);
    // 11 games in round 1 on 3 courts: Standard packs them, no "same bell" capacity error.
    const games: TimedGame[] = Array.from({ length: 11 }, (_, i) => ({ id: `g${i}`, round: 1, group: 1, bracket: i, people: [`a${i}`, `b${i}`], groups: [1] }));
    const r = planTimedSchedule({ days: [{ date: "2026-10-10", from: "08:00", to: "18:00", courtIds: [1, 2, 3] }], minutes: f.minutes, bells: f.bells, waves: false, roundDates: [], scheduledRounds: [], prefs: DEFAULT_SCHEDULING_PREFS, labels, busyOther: [] }, games);
    expect(r.issues).toEqual([]);
    expect(r.slots).toHaveLength(11);
    expect(r.issues.join(" ")).not.toMatch(/bell/i);
  });
  it("all-Bells => Bells slot timing retained", () => {
    const f = resolveTimedFormat({ plan: { scoring: bells }, labels, matchMinutes: 45 });
    expect(f.bells).toBe(true); expect(f.minutes).toBe(13);
  });
  it("mixed => not treated as Bells; Standard estimate never replaced by bell timing", () => {
    const f = resolveTimedFormat({ plan: { scoring: std, scoringOverrides: { "Ladies A": bells }, scheduling: { singles: 40 } }, labels });
    expect(f.bells).toBe(false); expect(f.mixed).toBe(true); expect(f.minutes).toBe(40);
  });
  it("switched Bells -> Standard: stale tournament_rules Bells mode is ignored", () => {
    const f = resolveTimedFormat({ plan: { scoring: std, scheduling: { singles: 35 } }, labels, rulesMode: "time_capped_points", matchMinutes: 13 });
    expect(f.bells).toBe(false); expect(f.minutes).toBe(35);
  });
  it("legacy tournament without plan scoring falls back to rules mode", () => {
    expect(resolveTimedFormat({ plan: {}, labels, rulesMode: "time_capped_points", matchMinutes: 13 }).bells).toBe(true);
  });
});
