import { describe, expect, it } from "vitest";
import { planStageSlots, stageSlotMinutes } from "@/lib/tournaments/stage-slot-assign";
import { drawNoticeKey } from "@/lib/smart-builder/draw-notice";

const qf = { id: "po1", name: "Quarterfinal", date: "2026-11-24", from: "18:00", to: "21:00", courtIds: [20, 21, 24], minutes: 35 };
const games = [1, 2, 3, 4].map((n) => ({ id: `g${n}`, stage_key: "po1", bracket_position: n }));

describe("stage slot assignment (Riverside Men's A QF)", () => {
  it("slot length comes from Stages & Scheduling match time, not a hardcoded 45", () => {
    expect(stageSlotMinutes({ planScheduling: { singles: 35, rest: 40 }, doubles: false, tournamentMinutes: 30 })).toBe(35);
    expect(stageSlotMinutes({ stageMinutes: 50, planScheduling: { singles: 35 }, doubles: false })).toBe(50);
    expect(stageSlotMinutes({ planScheduling: {}, doubles: false, tournamentMinutes: null })).toBe(45);
  });
  it("places four QFs deterministically across the saved courts", () => {
    const [r] = planStageSlots([qf], games, []);
    expect(r.slots).toEqual([
      { matchId: "g1", courtId: 20, time: "18:00" }, { matchId: "g2", courtId: 21, time: "18:00" },
      { matchId: "g3", courtId: 24, time: "18:00" }, { matchId: "g4", courtId: 20, time: "18:35" },
    ]);
    expect(planStageSlots([qf], games, [])).toEqual([r]);
  });
  it("skips booked cells and reports games that don't fit", () => {
    const busy = [20, 21, 24].map((c) => ({ courtId: c, start: "18:00", end: "20:40" }));
    const [r] = planStageSlots([qf], games, busy);
    expect(r.slots.map((s) => s.time)).toEqual(["20:20", "20:20", "20:20"].map(() => r.slots[0].time));
    expect(r.unplaced.length).toBe(4 - r.slots.length);
    expect(r.capacity).toBe(r.slots.length);
  });
  it("a stage's draw notice never shares the Swiss Round 1 key", () => {
    expect(drawNoticeKey({ round: 1, groupNumber: 1 })).not.toBe(drawNoticeKey({ round: 1, groupNumber: 1, stageKey: "po1" }));
  });
});
