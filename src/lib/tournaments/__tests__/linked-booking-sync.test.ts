import { describe, it, expect } from "vitest";
import { applyBookingEvent, linkedScheduleLabel, type SyncMatch } from "../linked-booking-sync";
const base: SyncMatch = { id: "m", status: "scheduled", scheduled_date: null, scheduled_time: null, court_id: null, booking_id: null, play_by: "2026-10-19" };
describe("linked booking sync", () => {
  it("link shows booked slot and keeps play-by", () => {
    const m = applyBookingEvent(base, { kind: "link", bookingId: "b1", date: "2026-10-16", time: "18:00:00", courtId: 1 });
    expect(m).toMatchObject({ booking_id: "b1", scheduled_date: "2026-10-16", play_by: "2026-10-19" });
    expect(linkedScheduleLabel(m, "Court 1")).toBe("Booked 2026-10-16 18:00 · Court 1 · Play by 2026-10-19");
  });
  it("reschedule follows booking; unrelated booking ignored", () => {
    const m = applyBookingEvent(base, { kind: "link", bookingId: "b1", date: "2026-10-16", time: "18:00:00", courtId: 1 });
    expect(applyBookingEvent(m, { kind: "reschedule", bookingId: "b1", date: "2026-10-17", time: "19:00:00", courtId: 2 })).toMatchObject({ scheduled_date: "2026-10-17", court_id: 2 });
    expect(applyBookingEvent(m, { kind: "reschedule", bookingId: "other", date: "2026-10-20", time: "19:00:00", courtId: 3 })).toEqual(m);
  });
  it("cancel reverts to play-by only", () => {
    const m = applyBookingEvent(applyBookingEvent(base, { kind: "link", bookingId: "b1", date: "2026-10-16", time: "18:00:00", courtId: 1 }), { kind: "cancel", bookingId: "b1" });
    expect(m).toMatchObject({ booking_id: null, scheduled_date: null, court_id: null, play_by: "2026-10-19" });
    expect(linkedScheduleLabel(m)).toBe("Play by 2026-10-19");
  });
  it("never changes decided matches or steals an existing link", () => {
    const done = { ...base, status: "completed", booking_id: "b1", scheduled_date: "2026-10-16" };
    expect(applyBookingEvent(done, { kind: "cancel", bookingId: "b1" })).toEqual(done);
    const linked = { ...base, booking_id: "b1" };
    expect(applyBookingEvent(linked, { kind: "link", bookingId: "b2", date: "2026-10-18", time: "18:00:00", courtId: 2 })).toEqual(linked);
  });
});
