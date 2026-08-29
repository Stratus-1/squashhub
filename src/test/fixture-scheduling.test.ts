import { describe, expect, it } from "vitest";
import {
  applyScheduleResult,
  applyUnscheduleResult,
  canScheduleFixture,
  canUnscheduleFixture,
  fixtureRowSchedule,
  fixtureScheduleState,
  fixtureSlotConflict,
  scheduleActionLabel,
  unscheduledFixtures,
  type FixtureLike,
} from "@/lib/tournaments/fixture-scheduling";

const generatedSemi = (over: Partial<FixtureLike> = {}): FixtureLike => ({
  id: "semi-1",
  status: "scheduled",
  stage: "knockout",
  player_a_member_id: "p1",
  player_b_member_id: "p2",
  scheduled_date: null,
  scheduled_time: null,
  court_id: null,
  booking_id: null,
  ...over,
} as FixtureLike);

describe("generated knockout fixture scheduling", () => {
  it("shows TBD until a court/date/time exists", () => {
    const m = generatedSemi();
    expect(fixtureScheduleState(m)).toBe("unscheduled");
    expect(fixtureRowSchedule(m)).toEqual({ date: null, time: null, isTbd: true });
    expect(scheduleActionLabel(m)).toBe("Make your court booking");
  });

  it("lets an organiser schedule a generated semi-final and shows the row", () => {
    const m = generatedSemi();
    expect(canScheduleFixture(m, null, { canManage: true }).allowed).toBe(true);

    const scheduled = applyScheduleResult(m, {
      match_id: m.id,
      booking_id: "bk-1",
      court_id: 3,
      scheduled_date: "2026-09-01",
      scheduled_time: "18:00:00",
    });

    // same fixture, never a duplicate
    expect(scheduled.id).toBe(m.id);
    expect(fixtureScheduleState(scheduled)).toBe("scheduled");
    expect(fixtureRowSchedule(scheduled)).toEqual({ date: "2026-09-01", time: "18:00", isTbd: false });
    expect(scheduled.booking_id).toBe("bk-1");
  });

  it("reschedules in place and keeps one linked booking", () => {
    const scheduled = applyScheduleResult(generatedSemi(), {
      booking_id: "bk-1", court_id: 3, scheduled_date: "2026-09-01", scheduled_time: "18:00:00",
    });
    expect(scheduleActionLabel(scheduled)).toBe("Reschedule your court booking");

    const moved = applyScheduleResult(scheduled, {
      booking_id: "bk-1", court_id: 1, scheduled_date: "2026-09-02", scheduled_time: "19:00:00",
    });
    expect(moved.id).toBe(scheduled.id);
    expect(moved.booking_id).toBe("bk-1");
    expect(moved.court_id).toBe(1);
    expect(fixtureRowSchedule(moved)).toEqual({ date: "2026-09-02", time: "19:00", isTbd: false });
  });

  it("unassigns without destroying the fixture or its result", () => {
    const scheduled = applyScheduleResult(generatedSemi({ score: "3-1" } as any), {
      booking_id: "bk-1", court_id: 3, scheduled_date: "2026-09-01", scheduled_time: "18:00:00",
    });
    expect(canUnscheduleFixture(scheduled, null, { canManage: true }).allowed).toBe(true);

    const cleared = applyUnscheduleResult(scheduled);
    expect(cleared.id).toBe(scheduled.id);
    expect((cleared as any).score).toBe("3-1");
    expect(cleared.player_a_member_id).toBe("p1");
    expect(fixtureScheduleState(cleared)).toBe("unscheduled");
    expect(cleared.booking_id).toBeNull();
  });

  it("cannot unassign a fixture that was never scheduled", () => {
    expect(canUnscheduleFixture(generatedSemi(), null, { canManage: true }).allowed).toBe(false);
  });

  it("validates court conflicts but ignores the fixture's own booking", () => {
    const scheduled = applyScheduleResult(generatedSemi(), {
      booking_id: "bk-1", court_id: 3, scheduled_date: "2026-09-01", scheduled_time: "18:00:00",
    });
    const bookings = [
      { id: "bk-1", court_id: 3, start_time: "18:00", end_time: "18:45", status: "active" },
      { id: "bk-2", court_id: 3, start_time: "19:00", end_time: "19:45", status: "active" },
    ];
    expect(fixtureSlotConflict(scheduled, 3, "18:00", 45, bookings)).toBeNull();
    expect(fixtureSlotConflict(scheduled, 3, "19:00", 45, bookings)).toMatch(/already booked/);
    expect(fixtureSlotConflict(scheduled, 2, "19:00", 45, bookings)).toBeNull();
  });

  it("admin can override even in player-arranged mode; strangers cannot", () => {
    const m = generatedSemi();
    expect(canScheduleFixture(m, "someone-else").allowed).toBe(false);
    expect(canScheduleFixture(m, "p2").allowed).toBe(true);
    expect(canScheduleFixture(m, "someone-else", { canManage: true }).allowed).toBe(true);
  });

  it("locks byes and decided matches", () => {
    expect(canScheduleFixture(generatedSemi({ is_bye: true }), null, { canManage: true }).allowed).toBe(false);
    expect(canScheduleFixture(generatedSemi({ status: "completed" }), null, { canManage: true }).allowed).toBe(false);
    expect(
      canScheduleFixture(generatedSemi({ player_b_member_id: null }), null, { canManage: true }).allowed,
    ).toBe(false);
  });

  it("lists only placeable fixtures for the organiser", () => {
    const list = [
      generatedSemi({ id: "a" }),
      generatedSemi({ id: "b", is_bye: true }),
      generatedSemi({ id: "c", status: "completed" }),
      applyScheduleResult(generatedSemi({ id: "d" }), { court_id: 1, scheduled_date: "2026-09-01", scheduled_time: "18:00:00" }),
    ];
    expect(unscheduledFixtures(list).map((m) => m.id)).toEqual(["a"]);
  });
});
