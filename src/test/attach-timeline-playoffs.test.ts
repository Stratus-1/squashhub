import { describe, it, expect } from "vitest";
import fs from "fs";
import { timelinePlayoffSpec, withAutoTimelinePlayoffs } from "@/lib/smart-builder/attach-timeline-playoffs";

const main = (id: string) => ({ id, order: 1, kind: "pools", name: "Main" });
const spec: any = { divisions: [
  { divisionId: "g1", label: "Mens A", stages: [main("v1-main")], deferredStages: [] },
  { divisionId: "g2", label: "Ladies B", stages: [main("v2-main")], deferredStages: [] },
] };
const plan: any = {
  format: { kind: "pools", pools: 2 }, playoff: { choice: "playoffs", rounds: 2 },
  stages: [
    { name: "Semifinal", unit: "Mens A", phase: "playoff", mode: "play_by", deadline: "2026-11-14", pairing: "crossover" },
    { name: "Final", unit: "Mens A", phase: "playoff", mode: "scheduled", date: "2026-11-15", from: "11:00", to: "17:00", courtIds: ["20"], pairing: "winners" },
  ],
};

describe("timeline play-offs attach on setup save", () => {
  it("adds play-offs only to the category that planned them, leaving others and the main stage untouched", () => {
    const next = timelinePlayoffSpec(spec, plan)!;
    expect(next.divisions[0].stages[0]).toEqual(spec.divisions[0].stages[0]);
    expect(next.divisions[0].stages.length + (next.divisions[0] as any).deferredStages.length).toBeGreaterThan(1);
    expect(next.divisions[1]).toEqual(spec.divisions[1]);
  });
  it("timeline play-offs without a start choice start automatically; an explicit confirm is kept", () => {
    const p = withAutoTimelinePlayoffs({ stages: [{ phase: "playoff" }, { phase: "playoff", start: "confirm" }, { phase: "main" }] });
    expect(p.stages.map((s: any) => s.start)).toEqual(["auto", "confirm", undefined]);
  });
  it("does nothing a second time (no duplicate stages)", () => {
    const once = timelinePlayoffSpec(spec, plan)!;
    expect(timelinePlayoffSpec(once, plan)).toBeNull();
  });
  it.runIf(fs.existsSync("/tmp/aabb.json"))("AABB: Men's A gets Semifinal + Final as real automatic stages", () => {
    const { spec: s, plan: p } = JSON.parse(fs.readFileSync("/tmp/aabb.json", "utf8"));
    const next: any = timelinePlayoffSpec(s, p);
    const g1 = next.divisions[0];
    console.log("AABB", JSON.stringify(g1.stages.map((x: any) => [x.name, x.kind, x.generation, x.waitForOrganiser, x.mapping?.matches?.length])), JSON.stringify(g1.deferredStages));
    expect(next.divisions.slice(1)).toEqual(s.divisions.slice(1));
  });
});

import { placeholderDates } from "@/lib/smart-builder/attach-timeline-playoffs";
describe("planned play-off fixture dates", () => {
  const plan = { stages: [
    { name: "Semifinal", unit: "Mens A 2", phase: "playoff", mode: "play_by", deadline: "2026-11-14" },
    { name: "Final", unit: "Mens A 2", phase: "playoff", mode: "scheduled", date: "2026-11-15", from: "11:00", to: "17:00" },
  ] };
  it("semifinal fixtures get the play-by date", () => expect(placeholderDates(plan, "Mens A 2 · Singles", "Semifinal 1")).toEqual({ play_by: "2026-11-14" }));
  it("final fixture gets its fixed day", () => expect(placeholderDates(plan, "Mens A 2 · Singles", "Final")).toEqual({ scheduled_date: "2026-11-15" }));
  it("other categories get nothing", () => expect(placeholderDates(plan, "Ladies B · Singles", "Final")).toEqual({}));
});

describe("play-offs saved earlier as 'decide later'", () => {
  const stale: any = { divisions: [{ ...spec.divisions[0], deferredStages: [{ name: "Semifinal", stageKey: "v1-po1", plan: { pairing: "later" } }] }, spec.divisions[1]] };
  const qf: any = { ...plan, playoff: { choice: "playoffs", rounds: 3 }, stages: [
    { name: "Quarterfinal", unit: "Mens A", phase: "playoff", mode: "play_by", deadline: "2026-11-14", pairing: "crossover" },
    ...plan.stages.map((s: any) => ({ ...s, pairing: "winners" })),
  ] };
  it("a later save with a Quarterfinal and pairing replaces them with real stages", () => {
    const next: any = timelinePlayoffSpec(stale, qf);
    expect(next.divisions[0].stages.map((s: any) => s.name).slice(1)).toEqual(["Quarterfinal", "Semifinal", "Final"]);
    expect(next.divisions[0].deferredStages).toEqual([]);
    expect(next.divisions[1]).toEqual(spec.divisions[1]);
  });
  it("saving again changes nothing (idempotent)", () => {
    expect(timelinePlayoffSpec(timelinePlayoffSpec(stale, qf), qf)).toBeNull();
  });
});
