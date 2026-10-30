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

describe("timed scheduler uses the structure page's planned match time", () => {
  const os = { group_durations: { "1": 10 }, pool_durations: { "1:1": 12, "1:2": 12 }, league_scoring_modes: { "1": "standard" } };
  it("per-pool slot minutes win over the category time and the 30-min tournament default", () => {
    const f = resolveTimedFormat({ plan: { scoring: std, scheduling: { singles: "" } }, labels: { "1": "Mixed" }, matchMinutes: 30, structure: os });
    expect(f.minutes).toBe(12);
  });
  it("two pools of 7 (42 games) fit 08:00–16:00 on 2 courts at 12 minutes", () => {
    const f = resolveTimedFormat({ plan: { scoring: std }, labels: { "1": "Mixed" }, matchMinutes: 30, structure: os });
    const games: TimedGame[] = [];
    for (const pool of [0, 1]) for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++)
      games.push({ id: `p${pool}-${a}-${b}`, round: 1, group: 1, bracket: games.length, people: [`p${pool}${a}`, `p${pool}${b}`], groups: [1] });
    const r = planTimedSchedule({ days: [{ date: "2026-10-31", from: "08:00", to: "16:00", courtIds: [18, 19] }], minutes: f.minutes, bells: false, waves: false, roundDates: [], scheduledRounds: [], prefs: DEFAULT_SCHEDULING_PREFS, labels: { "1": "Mixed" }, busyOther: [] }, games);
    expect(r.issues).toEqual([]);
    expect(r.slots).toHaveLength(42);
  });
});
