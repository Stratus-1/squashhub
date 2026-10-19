import { describe, it, expect } from "vitest";
import { champsSlotStarts, daySlotBoard } from "@/lib/tournaments/self-schedule";

const hold = (court_id: number, start_time: string, end_time: string) => ({
  court_id, start_time, end_time, status: "active", external_booker_name: "Club Championships",
});

describe("champsSlotStarts — the Champs' own match-length slots inside reserved evenings", () => {
  it("35-min games in a contiguous 18:00–21:00 block of 45-min holds start at 18:00, 18:35, 19:10, 19:45, 20:20", () => {
    const holds = [
      hold(27, "18:00", "18:45"), hold(27, "18:45", "19:30"), hold(27, "19:30", "20:15"), hold(27, "20:15", "21:00"),
    ];
    expect(champsSlotStarts(holds, 35).get(27)).toEqual(["18:00", "18:35", "19:10", "19:45", "20:20"]);
  });
  it("a single 45-min hold fits only one 35-min game", () => {
    expect(champsSlotStarts([hold(27, "18:00", "18:45")], 35).get(27)).toEqual(["18:00"]);
  });
  it("a gap between holds is never bridged", () => {
    const holds = [hold(27, "18:00", "18:45"), hold(27, "20:15", "21:00")];
    expect(champsSlotStarts(holds, 35).get(27)).toEqual(["18:00", "20:15"]);
  });
  it("keeps courts separate", () => {
    const holds = [hold(27, "18:00", "19:30"), hold(35, "19:30", "21:00")];
    const out = champsSlotStarts(holds, 35);
    expect(out.get(27)).toEqual(["18:00", "18:35"]);
    expect(out.get(35)).toEqual(["19:30", "20:05"]);
  });
  it("ignores rows that are not club championship holds", () => {
    const rows = [
      { court_id: 27, start_time: "18:00", end_time: "21:00", status: "active", external_booker_name: "Centurion Juniors" },
      { court_id: 28, start_time: "18:00", end_time: "21:00", status: "active", external_booker_name: "Club Championships", club_member_id: "m1" },
    ];
    expect(champsSlotStarts(rows, 35).size).toBe(0);
  });
  it("45-min games in 45-min holds match the club grid", () => {
    const holds = [hold(27, "18:00", "18:45"), hold(27, "18:45", "19:30")];
    expect(champsSlotStarts(holds, 45).get(27)).toEqual(["18:00", "18:45"]);
  });
  it("a reserved slot already carrying a scheduled game is excluded from the free span", () => {
    const rows = [
      hold(27, "18:00", "18:45"),
      { court_id: 27, start_time: "18:45", end_time: "19:30", status: "active", external_booker_name: "Club Championships", club_member_id: "m1", user_id: "u1" },
      hold(27, "19:30", "20:15"),
    ];
    // The occupied 18:45 hold is not a free span: only 18:00 and 19:30 remain.
    expect(champsSlotStarts(rows, 45).get(27)).toEqual(["18:00", "19:30"]);
  });
});

describe("daySlotBoard — the full-day view inside the fixture booking window", () => {
  const grid = ["17:00", "18:00", "18:45", "19:30"];
  it("marks a free Champs slot, a Champs hold, a taken slot and an open slot", () => {
    const bookings = [
      hold(27, "18:00", "18:45"), // free Champs slot
      hold(27, "18:45", "19:30"), // Champs hold still open, shown as reserved
      { court_id: 27, start_time: "17:00", end_time: "17:45", status: "active", club_member_id: "m9" }, // taken
    ];
    const board = daySlotBoard(grid, 45, 27, bookings, { champsFree: new Set(["18:00"]) });
    expect(board).toEqual([
      { time: "17:00", status: "taken" },
      { time: "18:00", status: "champs-free" },
      { time: "18:45", status: "champs" },
      { time: "19:30", status: "open" },
    ]);
  });
  it("ignores cancelled bookings and other courts", () => {
    const bookings = [
      { court_id: 27, start_time: "17:00", end_time: "17:45", status: "cancelled", club_member_id: "m9" },
      { court_id: 28, start_time: "17:45", end_time: "18:30", status: "active", club_member_id: "m9" },
    ];
    const board = daySlotBoard(grid, 45, 27, bookings);
    expect(board.every((s) => s.status === "open")).toBe(true);
  });
  it("keeps the match's own booking free while rescheduling", () => {
    const bookings = [
      { id: "b1", court_id: 27, start_time: "17:00", end_time: "17:45", status: "active", club_member_id: "m1" },
    ];
    const board = daySlotBoard(grid, 45, 27, bookings, { ignoreBookingId: "b1" });
    expect(board[0]).toEqual({ time: "17:00", status: "open" });
  });
});
