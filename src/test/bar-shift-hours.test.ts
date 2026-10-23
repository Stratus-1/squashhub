import { describe, expect, it } from "vitest";
import { paidShiftStart, workedHours, splitTipsByHours } from "@/lib/bar/shift-hours";

describe("staff paid hours", () => {
  it("15:00 normal entry pays from 16:00", () => { expect(paidShiftStart("2026-10-23T15:00:00+02:00")).toBe("2026-10-23T14:00:00.000Z"); });
  it("15:30 normal entry pays from 16:00", () => { expect(paidShiftStart("2026-10-23T15:30:00+02:00")).toBe("2026-10-23T14:00:00.000Z"); });
  it("late attendance never receives earlier hours", () => { expect(paidShiftStart("2026-10-23T17:00:00+02:00")).toBe("2026-10-23T15:00:00.000Z"); });
  it("special future start does not pay early entry", () => { expect(paidShiftStart("2026-10-23T09:00:00+02:00", "16:00", "2026-10-23T10:00:00+02:00")).toBe("2026-10-23T08:00:00.000Z"); });
  it("logs fractional hours and zero before paid start", () => { expect(workedHours("2026-10-23T14:00Z", "2026-10-23T20:30Z")).toBe(6.5); expect(workedHours("2026-10-23T14:00Z", "2026-10-23T13:00Z")).toBe(0); });
  it("shares R120 for six and two hours as R90 and R30", () => { expect(splitTipsByHours(120, [{ id: "a", hours: 6 }, { id: "b", hours: 2 }])).toEqual([{ id: "a", amount: 90 }, { id: "b", amount: 30 }]); });
  it("keeps every cent and excludes zero hours", () => { expect(splitTipsByHours(10, [{ id: "a", hours: 1 }, { id: "b", hours: 1 }, { id: "c", hours: 1 }, { id: "d", hours: 0 }])).toEqual([{ id: "a", amount: 3.34 }, { id: "b", amount: 3.33 }, { id: "c", amount: 3.33 }]); });
  it("zero-hour shared shifts need review", () => { expect(() => splitTipsByHours(10, [{ id: "a", hours: 0 }])).toThrow("management review"); });
});