import { describe, it, expect } from "vitest";
import { planFormalStageSlots, isCentrallyScheduled } from "@/lib/tournaments/formal-stage-schedule";

const order = [1, 2, 3, 4, 5]; // Men's 1st … Masters (configured order)
const sf = [1, 2, 3, 4, 5].flatMap((g) => [1, 2].map((b) => ({ id: `g${g}b${b}`, group: g, bracket: b })));
const win = { date: "2026-10-22", from: "07:42", to: "19:42", courtIds: [20, 21, 24, 26] };

describe("central formal-stage scheduling", () => {
  it("SF: last category first, top category last, category games adjacent", () => {
    const { slots, overflow } = planFormalStageSlots({ games: sf, groupOrder: order, window: win, minutes: 30, busy: [] });
    expect(overflow).toEqual([]);
    expect(slots.map((s) => s.id)).toEqual(["g5b1", "g5b2", "g4b1", "g4b2", "g3b1", "g3b2", "g2b1", "g2b2", "g1b1", "g1b2"]);
    expect(slots[0]).toEqual({ id: "g5b1", courtId: 20, time: "07:42" });
    expect(slots[1]).toEqual({ id: "g5b2", courtId: 21, time: "07:42" });
    expect(slots[9].time).toBe("08:42");
  });
  it("Final uses the same allocator and order", () => {
    const fin = [1, 2, 3].map((g) => ({ id: `f${g}`, group: g, bracket: 1 }));
    const { slots } = planFormalStageSlots({ games: fin, groupOrder: order, window: { ...win, date: "2026-10-26", to: "18:42" }, minutes: 30, busy: [] });
    expect(slots.map((s) => s.id)).toEqual(["f3", "f2", "f1"]);
  });
  it("avoids occupied court/time cells", () => {
    const { slots } = planFormalStageSlots({ games: sf.slice(0, 2), groupOrder: order, window: win, minutes: 30, busy: [{ courtId: 20, start: "07:42", end: "08:12" }] });
    expect(slots.map((s) => s.courtId)).toEqual([21, 24]);
  });
  it("reports overflow when capacity is insufficient (never TBD silently)", () => {
    const { slots, overflow } = planFormalStageSlots({ games: sf, groupOrder: order, window: { ...win, to: "08:42", courtIds: [20, 21] }, minutes: 30, busy: [] });
    expect(slots).toHaveLength(4);
    expect(overflow).toHaveLength(6);
  });
  it("play-by and decide-later stages are not centrally scheduled", () => {
    expect(isCentrallyScheduled({ label: "Semifinals", mode: "play_by", date: "2026-10-22" })).toBe(false);
    expect(isCentrallyScheduled({ label: "Semifinals", mode: "later", date: null })).toBe(false);
    expect(isCentrallyScheduled({ label: "Semifinals", mode: "scheduled", date: "2026-10-22", from: "07:42", to: "19:42", courtIds: ["20"] })).toBe(true);
  });
});
