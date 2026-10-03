import { describe, it, expect } from "vitest";
import { carveReservation, isOwnStageReservation } from "@/lib/smart-builder/playoff-schedule";
import { allocateSlots } from "@/lib/smart-builder/playoff-chain";
import { playoffSlotOrder } from "@/lib/smart-builder/playoff-slot-order";
import { scheduleActionShortLabel } from "@/lib/tournaments/fixture-scheduling";

const win = { from: "10:25", to: "17:25", courtIds: [20, 21, 24, 26] };

describe("Final session reservation", () => {
  it("treats the stage's own sbs block as room, not a clash", () => {
    expect(isOwnStageReservation({ external_id: "sbs:p:j0:20", start_time: "10:25:00", end_time: "17:25:00", court_id: 20 }, win)).toBe(true);
    expect(isOwnStageReservation({ external_id: "champ:x:match:y", start_time: "10:25:00", end_time: "17:25:00", court_id: 20 }, win)).toBe(false);
    expect(isOwnStageReservation({ external_id: "sbs:p:j0:9", start_time: "10:25:00", end_time: "17:25:00", court_id: 9 }, win)).toBe(false);
  });
  it("carves a game slot out leaving the rest reserved", () => {
    expect(carveReservation({ start: "10:25:00", end: "17:25:00" }, { start: "10:25", end: "11:10" })).toEqual([{ start: "11:10", end: "17:25" }]);
    expect(carveReservation({ start: "10:25", end: "17:25" }, { start: "12:00", end: "12:45" })).toEqual([{ start: "10:25", end: "12:00" }, { start: "12:45", end: "17:25" }]);
  });
  it("five Finals over four courts: four share the first start, fifth next slot, never invents beyond window", () => {
    const s = allocateSlots(5, { ...win, minutes: 45, busy: [] });
    expect(s.map((x) => `${x!.courtId}@${x!.time}`)).toEqual(["20@10:25", "21@10:25", "24@10:25", "26@10:25", "20@11:10"]);
    expect(allocateSlots(2, { from: "10:25", to: "10:50", courtIds: [20], minutes: 45, busy: [] })).toEqual([null, null]);
  });
  it("Ladies before Men, lower level first, strongest Men last; missing level warns", () => {
    const divs = [
      { id: "MA", label: "Men A", gender: "men" as const, leagueLevels: [1] },
      { id: "MB", label: "Men B", gender: "men" as const, leagueLevels: [3] },
      { id: "MC", label: "Men C", gender: "men" as const, leagueLevels: [5] },
      { id: "LA", label: "Ladies A", gender: "ladies" as const, leagueLevels: [3] },
      { id: "LB", label: "Ladies B", gender: "ladies" as const, leagueLevels: [5] },
    ];
    expect(playoffSlotOrder(divs).order).toEqual(["LB", "MC", "LA", "MB", "MA"]);
    const bad = playoffSlotOrder([...divs.slice(0, 4), { ...divs[4], leagueLevels: [null] }]);
    expect(bad.warnings.length).toBeGreaterThan(0);
  });
  it("unallocated organiser-run fixture says Assign court, never Book court", () => {
    expect(scheduleActionShortLabel({ scheduled_date: "2026-10-28" } as any, { centrallyScheduled: true })).toBe("Assign court");
    expect(scheduleActionShortLabel({ scheduled_date: "2026-10-28" } as any)).toBe("Book court");
  });
});
