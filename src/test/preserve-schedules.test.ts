import { describe, it, expect } from "vitest";
import {
  collectProtectedSchedules,
  isPlayerMatchBooking,
  isProtectedMatch,
  orphanedScheduleMessage,
  participantsKey,
  reconcileProtectedSchedules,
} from "@/lib/tournaments/preserve-schedules";
import { isUnscheduled } from "@/lib/tournaments/self-schedule";

const WILLEM = "willem";
const CRAIG = "craig";

/** The Riverside fixture: booked by the player, self-scheduled knockout. */
const bookedMatch = {
  id: "old-match",
  group_number: 1,
  player_a_member_id: WILLEM,
  player_b_member_id: CRAIG,
  scheduled_date: "2026-08-25",
  scheduled_time: "13:00:00",
  court_id: 20,
  booking_id: "booking-1",
  status: "scheduled",
  is_bye: false,
};

describe("protected match detection", () => {
  it("protects a player-booked match", () => {
    expect(isProtectedMatch(bookedMatch)).toBe(true);
  });

  it("protects a match with a result", () => {
    expect(isProtectedMatch({ ...bookedMatch, booking_id: null, status: "completed", winner_member_id: WILLEM })).toBe(true);
  });

  it("does not protect an unscheduled or bye match", () => {
    expect(isProtectedMatch({ ...bookedMatch, booking_id: null, scheduled_date: null, court_id: null, status: "scheduled" })).toBe(false);
    expect(isProtectedMatch({ ...bookedMatch, is_bye: true })).toBe(false);
  });

  it("distinguishes player bookings from organiser court blocks", () => {
    expect(isPlayerMatchBooking("champ:c1:match:m1")).toBe(true);
    expect(isPlayerMatchBooking("champ:c1:block:2026-08-25:20")).toBe(false);
    expect(isPlayerMatchBooking(null)).toBe(false);
  });

  it("keys a fixture on its participants regardless of side order", () => {
    expect(participantsKey({ player_a_member_id: WILLEM, player_b_member_id: CRAIG })).toBe(
      participantsKey({ player_a_member_id: CRAIG, player_b_member_id: WILLEM }),
    );
  });
});

describe("draw regeneration preserves player bookings", () => {
  it("carries the booking, court, date and time onto the new match row", () => {
    const protectedSchedules = collectProtectedSchedules([
      bookedMatch,
      { id: "other", group_number: 1, player_a_member_id: "a", player_b_member_id: "b", status: "scheduled" },
    ]);
    expect(protectedSchedules).toHaveLength(1);

    // The rebuild produces brand-new, unscheduled rows (new ids).
    const newDraw: any[] = [
      { group_number: 1, player_a_member_id: CRAIG, player_b_member_id: WILLEM, scheduled_date: null, scheduled_time: null, court_id: null, booking_id: null },
      { group_number: 1, player_a_member_id: "a", player_b_member_id: "b", scheduled_date: null, scheduled_time: null, court_id: null, booking_id: null },
    ];

    const { matched, orphans } = reconcileProtectedSchedules(protectedSchedules, newDraw);
    expect(orphans).toHaveLength(0);
    expect(matched).toHaveLength(1);

    for (const { protectedSchedule: p, match } of matched) {
      match.court_id = p.courtId;
      match.scheduled_date = p.scheduledDate;
      match.scheduled_time = p.scheduledTime;
      match.booking_id = p.bookingId;
    }

    // The Willem/Craig row survives the rebuild fully scheduled…
    expect(newDraw[0]).toMatchObject({
      court_id: 20,
      scheduled_date: "2026-08-25",
      scheduled_time: "13:00:00",
      booking_id: "booking-1",
    });
    expect(isUnscheduled(newDraw[0])).toBe(false);
    // …and the untouched fixture stays unscheduled.
    expect(isUnscheduled(newDraw[1])).toBe(true);
  });

  it("survives repeated regenerations / unrelated tournament edits", () => {
    let draw: any[] = [{ ...bookedMatch }];
    for (let i = 0; i < 3; i++) {
      const p = collectProtectedSchedules(draw);
      const rebuilt: any[] = [
        { group_number: 1, player_a_member_id: WILLEM, player_b_member_id: CRAIG, scheduled_date: null, scheduled_time: null, court_id: null, booking_id: null },
        { group_number: 1, player_a_member_id: "x", player_b_member_id: "y" },
      ];
      const { matched, orphans } = reconcileProtectedSchedules(p, rebuilt);
      expect(orphans).toHaveLength(0);
      matched.forEach(({ protectedSchedule: s, match }) => {
        match.court_id = s.courtId;
        match.scheduled_date = s.scheduledDate;
        match.scheduled_time = s.scheduledTime;
        match.booking_id = s.bookingId;
      });
      draw = rebuilt;
    }
    expect(draw[0].booking_id).toBe("booking-1");
    expect(draw[0].scheduled_time).toBe("13:00:00");
  });

  it("never silently clears a booking when the fixture disappears — it aborts", () => {
    const p = collectProtectedSchedules([bookedMatch]);
    const rebuilt: any[] = [{ group_number: 1, player_a_member_id: WILLEM, player_b_member_id: "someone-new" }];
    const { orphans, matched } = reconcileProtectedSchedules(p, rebuilt);
    expect(matched).toHaveLength(0);
    expect(orphans).toHaveLength(1);
    expect(orphanedScheduleMessage(orphans)).toMatch(/court booking/i);
    expect(orphanedScheduleMessage(orphans)).toMatch(/blocked/i);
  });

  it("keeps a fixture in the right division when the same pair meets twice", () => {
    const p = collectProtectedSchedules([bookedMatch, { ...bookedMatch, id: "old2", group_number: 2, booking_id: "booking-2", court_id: 21 }]);
    const rebuilt: any[] = [
      { group_number: 2, player_a_member_id: WILLEM, player_b_member_id: CRAIG },
      { group_number: 1, player_a_member_id: WILLEM, player_b_member_id: CRAIG },
    ];
    const { matched, orphans } = reconcileProtectedSchedules(p, rebuilt);
    expect(orphans).toHaveLength(0);
    expect(matched.find((m) => m.protectedSchedule.bookingId === "booking-1")!.match.group_number).toBe(1);
    expect(matched.find((m) => m.protectedSchedule.bookingId === "booking-2")!.match.group_number).toBe(2);
  });

  it("does not attach a bye row to a protected fixture", () => {
    const p = collectProtectedSchedules([bookedMatch]);
    const { orphans } = reconcileProtectedSchedules(p, [
      { group_number: 1, player_a_member_id: WILLEM, player_b_member_id: CRAIG, is_bye: true },
    ]);
    expect(orphans).toHaveLength(1);
  });
});

describe("result carry-over across draw regeneration", () => {
  const old = {
    id: "m1",
    group_number: 1,
    player_a_member_id: "A",
    player_b_member_id: "B",
    status: "completed",
    score: "11-9, 8-11, 11-5",
    game_scores: { sets: [{ a: 11, b: 9 }, { a: 8, b: 11 }, { a: 11, b: 5 }] },
    winner_member_id: "A",
    side_a_points: 2,
    side_b_points: 1,
  };

  it("copies the result onto the same-orientation new row", () => {
    const [p] = collectProtectedSchedules([old as any]);
    const carry = resultCarryOver(p, { player_a_member_id: "A", player_b_member_id: "B" } as any);
    expect(carry.status).toBe("completed");
    expect(carry.score).toBe("11-9, 8-11, 11-5");
    expect(carry.winner_member_id).toBe("A");
    expect(carry.side_a_points).toBe(2);
  });

  it("flips scores when the new row reverses the pair", () => {
    const [p] = collectProtectedSchedules([old as any]);
    const carry = resultCarryOver(p, { player_a_member_id: "B", player_b_member_id: "A" } as any);
    expect(carry.score).toBe("9-11, 11-8, 5-11");
    expect(carry.game_scores.sets[0]).toEqual({ a: 9, b: 11 });
    expect(carry.side_a_points).toBe(1);
    expect(carry.side_b_points).toBe(2);
  });

  it("leaves unplayed protected rows untouched", () => {
    const [p] = collectProtectedSchedules([
      { id: "m2", group_number: 1, player_a_member_id: "A", player_b_member_id: "B", booking_id: "bk1", status: "scheduled" } as any,
    ]);
    expect(resultCarryOver(p, { player_a_member_id: "A", player_b_member_id: "B" } as any)).toEqual({});
  });
});
