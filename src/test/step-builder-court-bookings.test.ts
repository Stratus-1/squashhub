import { describe, it, expect } from "vitest";
import { bookableSlots } from "@/lib/smart-builder/stage-bookings";

const base = { id: "s1", name: "Finals Day", mode: "scheduled", date: "2026-11-20", from: "09:00", to: "13:00", courtIds: ["3", "4"] };
describe("Step-by-Step court bookings", () => {
  it("only offers concrete scheduled stages, one slot per court with a stable id", () => {
    const s = bookableSlots("p1", [base, { ...base, id: "s2", mode: "play_by" }, { ...base, id: "s3", courtIds: [] }, { ...base, id: "s4", from: "" }]);
    expect(s.map((x) => x.externalId)).toEqual(["sbs:p1:s1:3", "sbs:p1:s1:4"]);
    expect(s[0]).toMatchObject({ courtId: 3, start: "09:00:00", end: "13:00:00" });
  });
  it("is idempotent: same plan gives the same ids on revisit", () => {
    expect(bookableSlots("p1", [base])).toEqual(bookableSlots("p1", [base]));
  });
});

import { internalOverlaps } from "@/lib/smart-builder/stage-bookings";
describe("internal overlaps", () => {
  it("flags plan slots that overlap each other on the same court, keeps main rounds and playoffs alike", () => {
    const slots = bookableSlots("p", [
      { id: "a", name: "Round 1 (Men)", mode: "scheduled", date: "2026-11-03", from: "18:00", to: "21:00", courtIds: ["1"] },
      { id: "b", name: "Round 1 (Ladies)", mode: "scheduled", date: "2026-11-03", from: "19:00", to: "20:00", courtIds: ["1", "2"] },
      { id: "c", name: "Final", mode: "scheduled", date: "2026-11-21", from: "09:00", to: "12:00", courtIds: ["1"] },
    ]);
    expect(slots).toHaveLength(4);
    const o = internalOverlaps(slots);
    expect(o.map((x) => x.externalId)).toEqual(["sbs:p:b:1"]);
    expect(o[0].reason).toMatch(/overlaps Round 1 \(Men\)/);
  });
});
