import { describe, expect, it } from "vitest";
import { dayCourtStages } from "@/lib/smart-builder/day-court-bookings";
import { bookableSlots, internalOverlaps } from "@/lib/smart-builder/stage-bookings";

describe("Courts day reservations", () => {
  it("reserves only the selected Courts 1, 3 and 4 on 31 October from 09:00 to 17:00", () => {
    const slots = bookableSlots("p:days", dayCourtStages([{ date: "2026-10-31", courtIds: ["1", "3", "4"], windows: [{ from: "09:00", to: "17:00" }] }]));
    expect(slots.map((s) => s.courtId)).toEqual([1, 3, 4]);
    expect(slots.every((s) => s.date === "2026-10-31" && s.start === "09:00:00" && s.end === "17:00:00")).toBe(true);
    expect(slots.map((s) => s.externalId)).toEqual(["sbs:p:days:2026-10-31:0900-1700:1", "sbs:p:days:2026-10-31:0900-1700:3", "sbs:p:days:2026-10-31:0900-1700:4"]);
  });
  it("unions overlapping windows without reserving the gap and keeps IDs stable after reordering", () => {
    const days = [{ date: "2026-10-31", courtIds: ["1"], windows: [{ from: "09:00", to: "12:00" }, { from: "11:00", to: "13:00" }, { from: "15:00", to: "17:00" }] }];
    const stages = dayCourtStages(days);
    expect(stages.map((s) => [s.from, s.to])).toEqual([["09:00", "13:00"], ["15:00", "17:00"]]);
    expect(dayCourtStages([{ ...days[0], windows: [...days[0].windows].reverse() }])).toEqual(stages);
    expect(internalOverlaps(bookableSlots("p:days", stages))).toEqual([]);
  });
  it("does not invent courts, dates or valid windows", () => {
    expect(dayCourtStages([{ date: "", courtIds: ["1"], windows: [{ from: "09:00", to: "17:00" }] }, { date: "2026-10-31", windows: [{ from: "09:00", to: "17:00" }] }, { date: "2026-10-31", courtIds: ["1"], windows: [{ from: "17:00", to: "09:00" }] }])).toEqual([]);
  });
});