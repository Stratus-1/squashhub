import { describe, it, expect } from "vitest";
import { allocateRoundSlots, isTournamentHold, type SlotBooking } from "./round-scheduling";

const hold = (id: string, court: number, s = "18:00", e = "20:15"): SlotBooking => ({ id, court_id: court, start_time: s, end_time: e, external_booker_name: "Club Championship" });
const w = { date: "2026-10-21", from: "18:00", to: "21:00", minutes: 45, courtIds: [1, 2] };

describe("allocateRoundSlots", () => {
  it("places matches only inside tournament block holds, earliest first", () => {
    const r = allocateRoundSlots([{ id: "a", players: ["p1", "p2"] }, { id: "b", players: ["p3", "p4"] }], w, [hold("h1", 1), hold("h2", 2)]);
    expect(r.assign).toEqual([{ matchId: "a", courtId: 1, time: "18:00" }, { matchId: "b", courtId: 2, time: "18:00" }]);
  });
  it("never uses an individually named booking or plan-less court", () => {
    const named: SlotBooking = { id: "x", court_id: 1, start_time: "18:00", end_time: "18:45", club_member_id: "m9" };
    expect(isTournamentHold(named)).toBe(false);
    const r = allocateRoundSlots([{ id: "a", players: ["p1", "p2"] }], w, [hold("h1", 1), named]);
    expect(r.assign[0]).toEqual({ matchId: "a", courtId: 1, time: "18:45" });
  });
  it("respects player's own booking clash", () => {
    const own: SlotBooking = { id: "y", court_id: 9, start_time: "18:00", end_time: "19:00", club_member_id: "p1" };
    const r = allocateRoundSlots([{ id: "a", players: ["p1", "p2"] }], w, [hold("h1", 1), own]);
    expect(r.assign[0].time).toBe("19:30");
  });
  it("reports shortage instead of downgrading", () => {
    const r = allocateRoundSlots([1, 2, 3, 4].map((i) => ({ id: `m${i}`, players: [`a${i}`, `b${i}`] })), { ...w, courtIds: [1] }, [hold("h1", 1, "18:00", "19:30")]);
    expect(r.assign).toHaveLength(2);
    expect(r.unplaced.map((u) => u.matchId)).toEqual(["m3", "m4"]);
  });
  it("fails closed with no block reservation", () => {
    const r = allocateRoundSlots([{ id: "a", players: ["p1", "p2"] }], w, []);
    expect(r.assign).toHaveLength(0);
    expect(r.unplaced[0].reason).toMatch(/block/);
  });
  it("accepts sbs plan blocks and ignores cancelled bookings", () => {
    const r = allocateRoundSlots([{ id: "a", players: ["p1", "p2"] }], w,
      [{ id: "s", court_id: 2, start_time: "19:00", end_time: "20:00", external_id: "sbs:plan:stage:1" },
       { id: "c", court_id: 2, start_time: "19:00", end_time: "19:45", club_member_id: "z", status: "cancelled" }]);
    expect(r.assign[0]).toEqual({ matchId: "a", courtId: 2, time: "19:00" });
  });
});
