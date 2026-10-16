import { describe, it, expect } from "vitest";
import { laterStageSchedule } from "@/lib/tournaments/replace-stage";

describe("play-off stage dates never precede the stage before", () => {
  it("drops days on or before the last day of the previous stage", () => {
    const s = laterStageSchedule({ rule: "fixed", date: "2026-10-29", roundDates: ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"] } as any, "2026-10-31");
    expect(s.date).toBe("2026-11-01");
    expect(s.roundDates).toEqual(["2026-11-01"]);
  });
  it("leaves the games undated when no valid day is left", () => {
    const s = laterStageSchedule({ rule: "fixed", date: "2026-10-29", roundDates: ["2026-10-29", "2026-10-30", "2026-10-31"] } as any, "2026-10-31");
    expect(s.rule).toBe("fixed");
    expect(s.date).toBeNull();
  });
});
