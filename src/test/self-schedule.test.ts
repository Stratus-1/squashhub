import { describe, it, expect } from "vitest";
import {
  canSelfScheduleMatch,
  isUnscheduled,
  isMatchTerminal,
  isParticipant,
  buildSlots,
  isSlotFree,
  freeSlotsForCourt,
  unscheduledMatchLabel,
  canMarkChampMatch,
} from "@/lib/tournaments/self-schedule";
import { buildNextRound } from "@/lib/tournaments/knockout";

const A = "member-a";
const B = "member-b";
const C = "member-c";

const drawMatch = (over: Record<string, any> = {}) => ({
  id: "m1",
  status: "scheduled",
  is_bye: false,
  scheduled_date: null,
  scheduled_time: null,
  court_id: null,
  play_by: "2026-03-01",
  player_a_member_id: A,
  player_b_member_id: B,
  ...over,
});

describe("self-scheduled draw creation", () => {
  it("a freshly generated match is unscheduled", () => {
    expect(isUnscheduled(drawMatch())).toBe(true);
    expect(unscheduledMatchLabel(drawMatch())).toContain("play by 2026-03-01");
  });

  it("a booked match is no longer unscheduled", () => {
    const m = drawMatch({ scheduled_date: "2026-02-20", scheduled_time: "18:00", court_id: 3 });
    expect(isUnscheduled(m)).toBe(false);
  });
});

describe("who may schedule", () => {
  it("either participant may schedule", () => {
    expect(canSelfScheduleMatch(drawMatch(), A).allowed).toBe(true);
    expect(canSelfScheduleMatch(drawMatch(), B).allowed).toBe(true);
    expect(isParticipant(drawMatch(), C)).toBe(false);
  });

  it("an unrelated member may not schedule", () => {
    const r = canSelfScheduleMatch(drawMatch(), C);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/Only the players/);
  });

  it("an organiser may schedule", () => {
    expect(canSelfScheduleMatch(drawMatch(), C, { canManage: true }).allowed).toBe(true);
  });

  it("completed / walkover / forfeited / bye matches can no longer be scheduled", () => {
    for (const status of ["completed", "walkover", "forfeited", "cancelled"]) {
      expect(canSelfScheduleMatch(drawMatch({ status }), A).allowed).toBe(false);
    }
    expect(isMatchTerminal(drawMatch({ is_bye: true }))).toBe(true);
    expect(canSelfScheduleMatch(drawMatch({ winner_member_id: A }), A).allowed).toBe(false);
  });

  it("a match whose opponent is not yet known cannot be scheduled", () => {
    expect(canSelfScheduleMatch(drawMatch({ player_b_member_id: null }), A).allowed).toBe(false);
  });
});

describe("court availability", () => {
  const slots = buildSlots(60, "06:00", "20:00");

  it("builds the club booking grid", () => {
    expect(slots[0]).toBe("06:00");
    expect(slots[slots.length - 1]).toBe("20:00");
  });

  it("blocks a slot that overlaps an active booking on that court", () => {
    const bookings = [{ id: "b1", court_id: 1, start_time: "18:00", end_time: "19:00", status: "active" }];
    expect(isSlotFree("18:00", 60, 1, bookings)).toBe(false);
    expect(isSlotFree("18:30", 60, 1, bookings)).toBe(false);
    expect(isSlotFree("19:00", 60, 1, bookings)).toBe(true);
    // other court is unaffected
    expect(isSlotFree("18:00", 60, 2, bookings)).toBe(true);
  });

  it("ignores cancelled bookings and the match's own booking when rescheduling", () => {
    const bookings = [
      { id: "b1", court_id: 1, start_time: "18:00", end_time: "19:00", status: "cancelled" },
      { id: "mine", court_id: 1, start_time: "19:00", end_time: "20:00", status: "active" },
    ];
    expect(isSlotFree("18:00", 60, 1, bookings)).toBe(true);
    expect(isSlotFree("19:00", 60, 1, bookings, "mine")).toBe(true);
    expect(isSlotFree("19:00", 60, 1, bookings)).toBe(false);
  });

  it("free slot list drops conflicting times", () => {
    const bookings = [{ id: "b1", court_id: 1, start_time: "07:00", end_time: "08:00", status: "active" }];
    const free = freeSlotsForCourt(slots, 60, 1, bookings);
    expect(free).not.toContain("07:00");
    expect(free).toContain("08:00");
  });
});

describe("progression", () => {
  it("the next-round match is created unscheduled", () => {
    const roundMatches = [
      { id: "1", round_number: 1, section_number: 1, bracket_position: 1, player_a_member_id: A, player_b_member_id: B, winner_member_id: A, status: "completed" },
      { id: "2", round_number: 1, section_number: 1, bracket_position: 2, player_a_member_id: C, player_b_member_id: "member-d", winner_member_id: C, status: "completed" },
    ] as any[];
    const rows = buildNextRound({ champId: "champ", groupNumber: 1, section: 1, roundMatches });
    expect(rows.length).toBe(1);
    for (const r of rows as any[]) {
      expect(r.scheduled_date ?? null).toBeNull();
      expect(r.scheduled_time ?? null).toBeNull();
      expect(r.court_id ?? null).toBeNull();
      expect(isUnscheduled(r)).toBe(true);
    }
  });
});

describe("mark permissions + progression (knockout + self-scheduled)", () => {
  const base = {
    id: "m1",
    status: "scheduled",
    player_a_member_id: "a",
    player_b_member_id: "b",
    scheduled_date: null,
    scheduled_time: null,
    court_id: null,
  };

  it("lets a participant mark an unscheduled match", () => {
    expect(canMarkChampMatch(base, "a").allowed).toBe(true);
    expect(canMarkChampMatch(base, "b").allowed).toBe(true);
  });

  it("blocks non-participants but allows organisers", () => {
    expect(canMarkChampMatch(base, "z").allowed).toBe(false);
    expect(canMarkChampMatch(base, "z", { canManage: true }).allowed).toBe(true);
  });

  it("blocks marking when club policy requires a booking", () => {
    expect(canMarkChampMatch(base, "a", { requireBooking: true }).allowed).toBe(false);
    expect(
      canMarkChampMatch(
        { ...base, scheduled_date: "2026-09-01", scheduled_time: "18:00", court_id: 3 },
        "a",
        { requireBooking: true },
      ).allowed,
    ).toBe(true);
  });

  it("does not allow free re-marking of decided matches", () => {
    for (const status of ["completed", "forfeited", "walkover", "cancelled"]) {
      expect(canMarkChampMatch({ ...base, status }, "a").allowed).toBe(false);
    }
    expect(canMarkChampMatch({ ...base, winner_member_id: "a" }, "a").allowed).toBe(false);
    expect(canMarkChampMatch({ ...base, is_bye: true }, "a").allowed).toBe(false);
  });

  it("creates the next round UNSCHEDULED with only a play-by date", () => {
    const roundMatches = [
      { id: "1", round_number: 1, bracket_position: 1, status: "completed", winner_member_id: "a" },
      { id: "2", round_number: 1, bracket_position: 2, status: "completed", winner_member_id: "d" },
    ];
    const rows = buildNextRound({
      champId: "c1",
      groupNumber: 1,
      section: 1,
      roundMatches: roundMatches as any,
      playBy: "2026-10-05",
    });
    expect(rows).toHaveLength(1);
    const next = rows[0] as any;
    expect(next.player_a_member_id).toBe("a");
    expect(next.player_b_member_id).toBe("d");
    expect(next.status).toBe("scheduled");
    expect(next.play_by).toBe("2026-10-05");
    expect(next.scheduled_date).toBeUndefined();
    expect(next.scheduled_time).toBeUndefined();
    expect(next.court_id).toBeUndefined();
    // and it shows up as an unscheduled upcoming match for its players
    expect(isUnscheduled(next)).toBe(true);
    expect(canSelfScheduleMatch(next, "a").allowed).toBe(true);
    expect(canMarkChampMatch(next, "d").allowed).toBe(true);
  });
});
