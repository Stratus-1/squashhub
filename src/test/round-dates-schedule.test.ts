import { describe, it, expect } from "vitest";
import { planTimedSchedule } from "@/lib/tournaments/formal-stage-schedule";

describe("rounds keep their planned dates", () => {
  it("round 2 plays on its own date, not packed into round 1's night", () => {
    const days = ["2026-10-22", "2026-10-28"].map((date) => ({ date, from: "16:00", to: "21:00", courtIds: [1, 2] }));
    const ctx: any = { days, minutes: 30, bells: false, waves: false, roundDates: ["2026-10-22", "2026-10-28"], scheduledRounds: [1, 2], prefs: {}, labels: {}, busyOther: [] };
    const games = [1, 2].flatMap((round) => [0, 1].map((i) => ({ id: `${round}-${i}`, round, group: 1, bracket: i, people: [`a${round}${i}`, `b${round}${i}`], groups: [1] })));
    const res: any = planTimedSchedule(ctx, games);
    expect(res.issues).toEqual([]);
    for (const s of res.slots) expect(s.date).toBe(s.id.startsWith("1-") ? "2026-10-22" : "2026-10-28");
  });
});
