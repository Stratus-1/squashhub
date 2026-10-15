import { describe, it, expect } from "vitest";
import { planTimedSchedule } from "../formal-stage-schedule";

const day = (date: string) => ({ date, from: "18:00", to: "21:00", courtIds: [1, 2] });
const ctx: any = {
  days: ["2026-10-20", "2026-10-21", "2026-10-27", "2026-11-03"].map(day),
  minutes: 35, bells: false, waves: false, roundDates: [], prefs: {}, labels: {}, scheduledRounds: [], busyOther: [],
  roundDeadlines: { 2: "2026-10-22", 3: "2026-10-29", 4: "2026-11-05" },
};
const g = (id: string, round: number, people: string[]) => ({ id, round, group: 1, bracket: 0, people, groups: [1] });

describe("one round per week", () => {
  it("places each round only inside the week ending on its play-by date", () => {
    const res = planTimedSchedule(ctx, [g("a", 2, ["p1", "p2"]), g("b", 3, ["p1", "p3"]), g("c", 4, ["p2", "p3"])]);
    expect(res.issues).toEqual([]);
    const by = Object.fromEntries(res.slots.map((s: any) => [s.id, s.date]));
    expect(by.a >= "2026-10-16" && by.a <= "2026-10-22").toBe(true);
    expect(by.b).toBe("2026-10-27");
    expect(by.c).toBe("2026-11-03");
  });
  it("writes nothing when a round has no playing night in its week", () => {
    const res = planTimedSchedule({ ...ctx, roundDeadlines: { 2: "2026-12-10" } }, [g("a", 2, ["p1", "p2"])]);
    expect(res.slots).toEqual([]);
    expect(res.issues[0]).toMatch(/Round 2/);
  });
});
