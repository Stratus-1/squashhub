import { describe, it, expect } from "vitest";
import { followUpStageGroups } from "@/lib/smart-builder/step-draw";
describe("follow-up stages are not drawn with Round 1", () => {
  it("Stage 2 waits for its first stage", () => {
    expect(followUpStageGroups(["Mens Singles A · Singles", "Mens Singles A · Stage 2 · Singles"])).toEqual({ 2: 1 });
  });
  it("ordinary categories and orphan stages are drawn normally", () => {
    expect(followUpStageGroups(["Mens A · Singles", "Ladies A · Singles"])).toEqual({});
    expect(followUpStageGroups(["Ladies A · Stage 2 · Singles"])).toEqual({});
  });
});

import { attachFollowUpStages } from "@/lib/smart-builder/step-draw";
describe("Stage 2 is attached to Stage 1 and waits for it", () => {
  const spec: any = { version: 1, architecture: "structured", name: "t", divisions: [{ divisionId: "g1", groupNumber: 1, label: "A", expectedEntrants: 8, stages: [{ id: "v-main", order: 0, kind: "swiss", swissRounds: 3, discipline: "singles" }] }] };
  const divs: any[] = [{ group: 2, label: "A · Stage 2", format: { kind: "pools", pools: 2, schedule: { rule: null, deadlines: [], upto: [], dates: [] } } }];
  it("adds an everyone-continues pools stage needing organiser start, with no players fixed", () => {
    const { spec: out, skipped } = attachFollowUpStages(spec, divs, { 2: 1 }, "v", "2026-10-31");
    const st = out.divisions[0].stages[1] as any;
    expect(skipped).toEqual([]);
    expect(st.kind).toBe("pools");
    expect(st.pools).toBe(2);
    expect(st.progression.mode).toBe("all_continue");
    expect(st.generation).toBe("owner_approval");
    expect(st.poolMembers).toBeUndefined();
  });
});

import { generateFromSpec } from "@/lib/tournaments/engine-service";
describe("Round 1 draw with Stage 2 attached", () => {
  it("dry run creates only Swiss R1", () => {
  const spec: any = { version: 1, architecture: "structured", name: "t", divisions: [{ divisionId: "g1", groupNumber: 1, label: "A", unit: "players", expectedEntrants: 8, placements: "champion", finalStandings: "last_stage", seeding: { source: "entry_order", method: "snake" }, entrants: Array.from({length:8},(_,i)=>({id:"p"+i,rank:i+1})), stages: [{ id: "v-main", order: 0, kind: "swiss", name:"Swiss rounds", swissRounds: 3, discipline: "singles", schedule:{rule:"play_by",deadline:"2026-10-31"} }] }] };
  const out = attachFollowUpStages(spec, [{ group: 2, label: "x", format: { kind: "pools", pools: 2, schedule: { rule: null, deadlines: [], upto: [], dates: [] } } }] as any, { 2: 1 }, "v", "2026-10-31").spec;
  const fx = generateFromSpec(out, "t");
  expect(new Set(fx.map((f) => f.stageId))).toEqual(new Set(["v-main"]));
  expect(fx.length).toBe(4);
});
});
