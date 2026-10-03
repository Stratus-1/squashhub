import { describe, it, expect } from "vitest";
import { planFormalStageSlots, stageScheduling, findStep, planSteps } from "@/lib/tournaments/formal-stage-schedule";

const order = [1, 2, 3, 4, 5]; // Men's 1st … Masters (configured order)
const win = (courts: number[], from = "07:42", to = "18:42") => ({ date: "2026-10-26", from, to, courtIds: courts });
const g = (id: string, group: number, bracket = 1) => ({ id, group, bracket });

describe("universal fixed-stage scheduler", () => {
  it("normal fixed round-robin/paced round gets slots, never TBD", () => {
    const r = planFormalStageSlots({ games: [g("a", 1), g("b", 1, 2)], groupOrder: [1], window: win([1]), minutes: 30, busy: [] });
    expect(r.slots.map((s) => s.time)).toEqual(["07:42", "08:12"]);
    expect(r.overflow).toEqual([]);
  });
  it.each(["Quarterfinals", "Semifinals", "Final"])("%s uses the same allocator, last category first", () => {
    const games = [g("m1", 1), g("m2", 2), g("l", 3), g("b", 4), g("ma", 5)];
    const r = planFormalStageSlots({ games, groupOrder: order, window: win([20, 21, 24, 26]), minutes: 30, busy: [] });
    expect(r.slots.map((s) => [s.id, s.courtId, s.time])).toEqual([
      ["ma", 20, "07:42"], ["b", 21, "07:42"], ["l", 24, "07:42"], ["m2", 26, "07:42"], ["m1", 20, "08:12"],
    ]);
  });
  it("keeps a category's games adjacent across courts", () => {
    const r = planFormalStageSlots({ games: [g("x1", 1, 1), g("y1", 2, 1), g("x2", 1, 2), g("y2", 2, 2)], groupOrder: [1, 2], window: win([1, 2]), minutes: 30, busy: [] });
    expect(r.slots.map((s) => s.id)).toEqual(["y1", "y2", "x1", "x2"]);
  });
  it("skips collisions and reports capacity", () => {
    const busy = [{ courtId: 1, start: "07:42", end: "08:12" }];
    const r = planFormalStageSlots({ games: [g("a", 1), g("b", 1, 2)], groupOrder: [1], window: win([1], "07:42", "08:42"), minutes: 30, busy });
    expect(r.slots).toEqual([{ id: "a", courtId: 1, time: "08:12" }]);
    expect(r.overflow).toEqual(["b"]);
    expect(r).toMatchObject({ required: 2, available: 1 });
  });
  it("play-by and decide-later are never centrally scheduled", () => {
    const steps = planSteps({ stages: [
      { name: "Round 1", mode: "play_by", deadline: "2026-10-10", courtIds: [] },
      { name: "Round 2", mode: "later" },
      { name: "Final", mode: "scheduled", date: "2026-10-26", from: "07:42", to: "18:42", courtIds: ["20"] },
    ] });
    expect(stageScheduling(findStep(steps, "Round 1"))).toBe("play_by");
    expect(stageScheduling(findStep(steps, "Round 2"))).toBe("decide_later");
    expect(stageScheduling(findStep(steps, "Finals"))).toBe("fixed");
  });
});

import { slotFitsStage } from "@/lib/tournaments/formal-stage-schedule";
describe("per-stage court resources", () => {
  const sf = { label: "Semifinals", mode: "scheduled", date: "2026-10-22", from: "07:42", to: "19:42", courtIds: ["1", "2", "3", "4"] };
  const fin = { label: "Final", mode: "scheduled", date: "2026-10-26", from: "07:42", to: "18:42", courtIds: ["1", "2", "3"] };
  it("SF courts 1-4, Final courts 1-3: Final never uses Court 4; top category latest", () => {
    const games = [g("m1", 1), g("m2", 2), g("l", 3), g("b", 4), g("ma", 5)];
    const r = planFormalStageSlots({ games, groupOrder: order, window: { date: fin.date, from: fin.from, to: fin.to, courtIds: fin.courtIds.map(Number) }, minutes: 30, busy: [] });
    expect(r.slots.every((s) => s.courtId !== 4)).toBe(true);
    expect(r.slots.map((s) => [s.id, s.courtId, s.time])).toEqual([
      ["ma", 1, "07:42"], ["b", 2, "07:42"], ["l", 3, "07:42"], ["m2", 1, "08:12"], ["m1", 2, "08:12"],
    ]);
    const s4 = planFormalStageSlots({ games, groupOrder: order, window: { date: sf.date, from: sf.from, to: sf.to, courtIds: [1, 2, 3, 4] }, minutes: 30, busy: [] });
    expect(s4.slots.some((s) => s.courtId === 4)).toBe(true);
  });
  it("a saved Final game on Court 4 is invalid for the Final but valid for the SF window rules", () => {
    expect(slotFitsStage(fin, { scheduled_date: "2026-10-26", scheduled_time: "07:42", court_id: 4 }, 30)).toBe(false);
    expect(slotFitsStage(fin, { scheduled_date: "2026-10-26", scheduled_time: "07:42", court_id: 3 }, 30)).toBe(true);
    expect(slotFitsStage(fin, { scheduled_date: "2026-10-26", scheduled_time: "18:30", court_id: 3 }, 30)).toBe(false);
  });
  it("3 courts with a too-short window blocks via overflow instead of borrowing a court", () => {
    const games = [g("a", 1), g("b", 2), g("c", 3), g("d", 4)];
    const r = planFormalStageSlots({ games, groupOrder: order, window: { date: fin.date, from: "07:42", to: "08:12", courtIds: [1, 2, 3] }, minutes: 30, busy: [] });
    expect(r).toMatchObject({ required: 4, available: 3 });
    expect(r.overflow).toEqual(["a"]);
  });
});
