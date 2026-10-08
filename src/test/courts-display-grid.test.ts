import { describe, expect, it } from "vitest";
import { displayGrid } from "@/pages/CourtsDisplay";

const club = (slot: number, open: string, last: string) => ({ name: "X", logo_url: null, slot_minutes: slot, open_time: open, last_slot_time: last });

describe("court display grid", () => {
  it("Uitsig 45-min slots run 05:15 through the end of the 21:45 slot (22:30)", () => {
    const g = displayGrid({ club: club(45, "05:15:00", "21:45:00"), bookings: [] });
    expect(g.start).toBe(5 * 60 + 15);
    expect(g.end).toBe(22 * 60 + 30);
    expect(g.slots.at(-1)).toBe(21 * 60 + 45);
    expect(g.slots).toHaveLength(23);
  });
  it("supports other intervals and keeps alignment when a booking runs late", () => {
    const g = displayGrid({ club: club(90, "06:00", "19:30"), bookings: [{ court_id: 1, start: "21:00", end: "22:30", type: null, label: "" }] });
    expect(g.end).toBe(22 * 60 + 30);
    expect(g.slots.every((s) => (s - 360) % 90 === 0)).toBe(true);
  });
});
