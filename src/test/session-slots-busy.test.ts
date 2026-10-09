import { describe, it, expect } from "vitest";
import { placeGamesInSessions } from "@/lib/smart-builder/session-slots";
const days = [{ date: "2026-10-13", from: "18:00", to: "19:30", courtIds: [1, 2] }];
describe("placeGamesInSessions busy cells", () => {
  it("skips slots held by games or bookings", () => {
    const r = placeGamesInSessions(["a", "b", "c"], days, 45, [
      { date: "2026-10-13", court: 1, start: "18:00", end: "18:45" },
      { date: "2026-10-13", court: 2, start: "18:30", end: "19:00" },
    ]);
    expect(r.slots).toBe(1);
    expect(r.placed).toEqual([{ id: "a", scheduled_date: "2026-10-13", scheduled_time: "18:45", court_id: 1 }]);
    expect(r.unplaced).toEqual(["b", "c"]);
  });
  it("fills all slots when nothing is busy", () => {
    expect(placeGamesInSessions(["a", "b", "c", "d", "e"], days, 45).placed.length).toBe(4);
  });
});
