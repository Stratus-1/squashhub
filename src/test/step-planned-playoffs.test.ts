import { describe, it, expect } from "vitest";
import { attachPlannedPlayoffs, plannedPlayoffStages, proposeFormat } from "@/lib/smart-builder/step-draw";

const plan = {
  format: { kind: "cross", crossMode: "parent" }, playoff: { choice: "later", rounds: 2 },
  stages: [
    { id: "r1", phase: "main", mode: "play_by", deadline: "2026-10-12", name: "Round 1" },
    { id: "f", phase: "playoff", mode: "scheduled", date: "2026-11-03", from: "08:29", to: "17:29", name: "Final", pairing: "same_position", courtIds: [20, 21] },
    { id: "s", phase: "playoff", mode: "scheduled", date: "2026-11-02", from: "15:29", to: "21:29", name: "Semifinals", pairing: "crossover", courtIds: [20, 21, 24, 26] },
  ],
};
const spec = (deferred: any[] = []) => ({ version: 1, architecture: "structured", name: "t", divisions: ["Mens", "Ladies"].map((p, i) => ({
  divisionId: `x${i}`, label: `${p} › A · Doubles v ${p} › B · Doubles`, poolLabels: [`${p} › A · Doubles`, `${p} › B · Doubles`],
  stages: [{ id: "v1-main", order: 0, kind: "mapped" }], deferredStages: deferred,
})) }) as any;

describe("planned play-offs reach progression", () => {
  it("reads play-off stages from the saved timeline in play order with their plan", () => {
    const s = plannedPlayoffStages(plan, "Mens::A");
    expect(s.map((x) => x.name)).toEqual(["Semifinals", "Final"]);
    expect(s[0].plan).toMatchObject({ pairing: "crossover", date: "2026-11-02", courtIds: [20, 21, 24, 26] });
  });
  it("timeline play-offs win even when the generic playoff answer is 'later'", () => {
    expect(proposeFormat(plan, "Mens › A · Doubles").playoffs).toEqual(["Semifinals", "Final"]);
  });
  it("attaches deferred stages to every division (Men and Ladies independently), idempotently", () => {
    const next = attachPlannedPlayoffs(spec(), plan)!;
    for (const d of next.divisions as any[]) {
      expect(d.deferredStages.map((x: any) => [x.stageKey, x.name, x.plannedDate])).toEqual([["v1-po1", "Semifinals", "2026-11-02"], ["v1-po2", "Final", "2026-11-03"]]);
      expect(d.stages).toHaveLength(1); // existing stage untouched
    }
    expect(attachPlannedPlayoffs(next, plan)).toBeNull();
  });
  it("never invents play-offs when none were planned", () => {
    expect(attachPlannedPlayoffs(spec(), { ...plan, stages: plan.stages.slice(0, 1) })).toBeNull();
    expect(attachPlannedPlayoffs(spec(), { ...plan, playoff: { choice: "none" } })).toBeNull();
  });
});
