import { describe, it, expect } from "vitest";
import { gridTimeSlots, timeSlots } from "@/lib/tournaments/swiss-positional-draw";

describe("gridTimeSlots snaps game starts to the club booking grid", () => {
  it("35-min games on a 45-min grid start on grid boundaries, not at 19:10/20:20", () => {
    expect(gridTimeSlots("18:00", "21:00", 35, 45)).toEqual(["18:00", "18:45", "19:30", "20:15"]);
  });
  it("rounds a mid-grid window start up to the next boundary", () => {
    expect(gridTimeSlots("18:10", "21:00", 35, 45)).toEqual(["18:45", "19:30", "20:15"]);
  });
  it("drops a last slot where the match would run past the window end", () => {
    expect(gridTimeSlots("18:00", "20:00", 35, 45)).toEqual(["18:00", "18:45"]);
  });
  it("falls back to plain timeSlots when the grid fits nothing", () => {
    expect(gridTimeSlots("18:00", "18:40", 35, 45)).toEqual(timeSlots("18:00", "18:40", 35, 0));
  });
  it("behaves like timeSlots when no grid is given", () => {
    expect(gridTimeSlots("18:00", "20:00", 30, 0)).toEqual(["18:00", "18:30", "19:00", "19:30"]);
  });
});
