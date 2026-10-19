import { describe, it, expect } from "vitest";
import { champsSlotStarts, isSlotFreeForMatch, scheduledFixtureBlockers } from "../self-schedule";

describe("scheduled fixtures block the Club Champs picker", () => {
  const hold = { id: "h", court_id: 27, start_time: "18:00", end_time: "21:00", status: "active", external_booker_name: "Club Championships" };
  const fx = [{ id: "m1", court_id: 27, scheduled_time: "18:00:00", booking_id: null, status: "scheduled", player_a_member_id: "a", player_b_member_id: "b" }];
  const me = { id: "m2", player_a_member_id: "c", player_b_member_id: "d" } as any;
  it("18:00 on a court with an unbooked scheduled game is not offered", () => {
    const bookings = [hold, ...scheduledFixtureBlockers(fx as any, 45, "m2")];
    const starts = champsSlotStarts(bookings, 45).get(27)!;
    expect(starts).toContain("18:00");
    expect(isSlotFreeForMatch("18:00", 45, 27, me, bookings)).toBe(false);
    expect(isSlotFreeForMatch("18:45", 45, 27, me, bookings)).toBe(true);
  });
  it("a match never blocks itself", () => {
    expect(scheduledFixtureBlockers(fx as any, 45, "m1")).toHaveLength(0);
  });
});
