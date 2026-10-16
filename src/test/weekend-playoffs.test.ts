import { describe, it, expect } from "vitest";
import { planPlayoffsAfter } from "@/lib/tournaments/weekend-playoffs";

const days = [{ date: "2026-10-31", from: "09:00", to: "17:00", courtIds: [1, 2] }];
describe("weekend play-offs start straight after the previous stage", () => {
  it("quarterfinals start right after the last round game, semis after the quarterfinals", () => {
    const games = [1, 2, 3, 4].map((i) => ({ id: `q${i}`, round: 1, order: i })).concat([1, 2].map((i) => ({ id: `s${i}`, round: 2, order: i })));
    const { slots, unplaced } = planPlayoffsAfter({ days, minutes: 30, after: { date: "2026-10-31", time: "12:00" }, games, busy: [] });
    expect(unplaced).toEqual([]);
    const at = Object.fromEntries(slots.map((s) => [s.id, s.time]));
    expect(at.q1).toBe("12:00"); expect(at.q2).toBe("12:00"); expect(at.q3).toBe("12:30"); expect(at.q4).toBe("12:30");
    expect(at.s1).toBe("13:00"); expect(at.s2).toBe("13:00");
  });
  it("never places a play-off game before the previous stage ends", () => {
    const { slots, unplaced } = planPlayoffsAfter({ days, minutes: 30, after: { date: "2026-10-31", time: "16:45" }, games: [{ id: "f", round: 1, order: 1 }], busy: [] });
    expect(slots).toEqual([]); expect(unplaced).toEqual(["f"]);
  });
});
