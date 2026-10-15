import { describe, it, expect } from "vitest";
import { resolveFixtureSchedule, appliedRoundPlayBy } from "@/lib/tournaments/stage-schedule";
import { buildSwissProgression, buildProposedSwissGrid } from "@/lib/tournaments/swiss-progression-view";

const fixedStage = { stageId: "s", name: "Swiss", order: 0, rule: "fixed" as const, date: "2026-10-14", deadline: null, timeFrom: "18:00", timeTo: "21:00", courtIds: [1] };
const rows = [{ id: "r2", round_number: 2, group_number: 3, scheduling_mode: "self", play_by: "2026-11-13" }, { id: "r3", round_number: 3, group_number: 3, scheduling_mode: "club", play_by: null }];

describe("applied Play by date overrides stale fixed rule", () => {
  it("round switched to Play by shows the saved deadline", () => {
    const r = resolveFixtureSchedule({ round_id: "r2", round_number: 2, stage_key: "s", play_by: "2026-11-13" }, { stage: fixedStage, rows });
    expect(r).toEqual({ mode: "play_by", playBy: "2026-11-13", bookable: true });
  });
  it("timed round stays scheduled", () => {
    expect(resolveFixtureSchedule({ round_id: "r3", round_number: 3, stage_key: "s", scheduled_date: "2026-10-19", scheduled_time: "18:00" }, { stage: fixedStage, rows }).mode).toBe("scheduled");
  });
  it("only self rows with a deadline count", () => {
    expect(appliedRoundPlayBy(rows[1])).toBeNull();
    expect(appliedRoundPlayBy(rows[0])).toBe("2026-11-13");
  });
  it("progression grid replaces proposed court/time with Play by and no court", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    const names = Object.fromEntries(ids.map((x) => [x, x.toUpperCase()]));
    const model = buildSwissProgression({ seedOrder: ids, names, totalRounds: 3, matches: [1, 2, 3, 4].map((i) => ({ id: `m${i}`, round: 1, a: `p${i}`, b: `p${9 - i}`, winner: null, status: "scheduled" })) });
    const slots = { "r2-1v4": { kind: "planned", date: "2026-11-11", time: "18:00", courtId: 1, courtName: "Court 1" } } as any;
    const g = buildProposedSwissGrid(model, { slots, appliedPlayBy: { 2: "2026-11-13" } });
    const r2 = g.rounds.find((r) => r.round === 2)!;
    expect(r2.schedule?.label).toBe("Play by Fri 13 Nov");
    for (const b of r2.blocks.filter((b) => b.rows[1].name !== "Bye")) { expect(b.court).toBeNull(); expect(b.rows[0].when).toBe("Play by Fri 13 Nov"); }
    const r3 = g.rounds.find((r) => r.round === 3)!;
    expect(r3.schedule?.kind).not.toBe("play_by");
  });
});
