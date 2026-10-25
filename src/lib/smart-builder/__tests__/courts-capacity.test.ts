import { describe, expect, it } from "vitest";
import { courtsCapacity, type CourtsCapacityUnit } from "../courts-capacity";

const answers = { stagePlans: { Open: [{ id: "rr", kind: "round_robin" as const, pools: 6 }] } };
const unit: CourtsCapacityUnit = { key: "Open", label: "Open", entrants: 24, doubles: true, estimated: false, slotMinutes: 23, playoffGames: 3, playoffUnresolved: false };
const day = { date: "2026-10-31", courts: "3", courtIds: ["1", "3", "4"], windows: [{ from: "09:00", to: "17:00" }] };

describe("Courts capacity", () => {
  it("costs six four-pair RR pools and semifinals/final against three eight-hour courts", () => {
    const c = courtsCapacity(answers, [day], [unit]);
    expect(c.rows[0].poolGames).toBe(36);
    expect(c.games).toBe(39);
    expect(c.requiredMinutes).toBe(897);
    expect(c.availableMinutes).toBe(1440);
    expect(c.availableSlots).toBe(60);
    expect(c.fits).toBe(true);
  });
  it("does not claim a complete fit when playoff qualification is undecided", () => {
    expect(courtsCapacity(answers, [day], [{ ...unit, playoffUnresolved: true }]).fits).toBeNull();
  });
  it("deduplicates overlapping court windows and honours an empty court selection", () => {
    expect(courtsCapacity(answers, [day, day], [unit]).availableMinutes).toBe(1440);
    expect(courtsCapacity(answers, [{ ...day, courtIds: [] }], [unit]).availableMinutes).toBe(0);
  });
  it("reports a shortfall and sums categories rather than giving each the whole capacity", () => {
    const a = { stagePlans: { ...answers.stagePlans, Other: answers.stagePlans.Open } };
    expect(courtsCapacity(a, [day], [unit, { ...unit, key: "Other" }]).fits).toBe(false);
  });
});