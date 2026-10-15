import { describe, expect, it } from "vitest";
import type { StepAnswers } from "@/components/smart-builder/StepByStepBuilder";
import { addCanvasDivision, attachCanvasBlock, canvasProjection, visualStructurePilot } from "@/lib/smart-builder/structure-canvas";
import { rowStages } from "@/lib/smart-builder/structure-rows";
import { validateStagePlan } from "@/lib/smart-builder/stage-plan";

const empty = () => ({ categories: [], subcats: {}, categoryTypes: {}, disc: {}, unitEntries: {}, picks: {}, format: { kind: "later" }, formatOverrides: {}, stagePlans: {} } as unknown as StepAnswers);
describe("Riverside canonical visual structure", () => {
  it("roundtrips hierarchy, format, pools and positional playoff without any separate graph authority", () => {
    let a = addCanvasDivision(empty());
    const division = canvasProjection(a).items[0];
    a = attachCanvasBlock(a, division, "subdivision").answers;
    const sub = canvasProjection(a).items.find((n) => n.type === "subdivision");
    if (!sub) throw new Error("Missing subdivision");
    expect(sub.label).toBe("Group 1");
    a = attachCanvasBlock(a, sub, "round_robin").answers;
    let stage = canvasProjection(a).items.find((n) => n.type === "stage");
    if (!stage) throw new Error("Missing stage");
    a = attachCanvasBlock(a, stage, "pool").answers;
    a.stagePlans[sub.key][0].advance = { mode: "per_pool", perPool: 2 };
    a.stagePlans[sub.key][0].poolNames = ["Pool A", "Pool Boasts"];
    a = attachCanvasBlock(a, stage, "monrad").answers;
    a.structureCanvas = { version: 1, positions: { [sub.id]: { x: 123, y: 456 } } };
    const roundtrip = JSON.parse(JSON.stringify(a)) as StepAnswers;
    expect(canvasProjection(roundtrip)).toEqual(canvasProjection(a));
    expect(roundtrip.structureCanvas.positions[sub.id]).toEqual({ x: 123, y: 456 });
    expect(rowStages(roundtrip, sub.key).map((s) => s.kind)).toEqual(["pools", "monrad"]);
    expect(roundtrip.formatOverrides[sub.key].kind).toBe("pools");
    expect(canvasProjection(a).items.filter((n) => n.type === "pool")).toHaveLength(2);
    expect(canvasProjection(roundtrip).items.some((n) => n.label === "Pool Boasts")).toBe(true);
    expect(roundtrip.picks).toEqual({}); expect(roundtrip.createdTournamentId).toBeUndefined();
  });
  it("replaces a blank wizard placeholder and numbers editable subgroups without affecting other answers", () => {
    const base = { ...empty(), categories: [""], name: "Synthetic", fee: { has: false, amount: "0", varies: false, perUnit: {}, doublesBasis: "pair" as const, doublesCover: null } };
    let a = addCanvasDivision(base); expect(a.categories).toEqual(["Division 1"]);
    const d = canvasProjection(a).items[0];
    a = attachCanvasBlock(a, d, "subdivision").answers;
    a = attachCanvasBlock(a, d, "group").answers;
    expect(a.subcats[d.key]).toEqual(["Group 1", "Group 2"]);
    expect(a.fee).toEqual(base.fee); expect(base.categories).toEqual([""]);
  });
  it("rejects wrong hierarchy, pool ownership, replacing an existing format and branching from earlier stages", () => {
    let a = addCanvasDivision(empty()); const d = canvasProjection(a).items[0];
    expect(() => attachCanvasBlock(a, d, "pool")).toThrow("Round robin");
    a = attachCanvasBlock(a, d, "swiss").answers;
    expect(() => attachCanvasBlock(a, d, "monrad")).toThrow("already has a format");
    const s = canvasProjection(a).items.find((n) => n.type === "stage"); if (!s) throw new Error("stage");
    expect(() => attachCanvasBlock(a, s, "group")).toThrow("main division");
    expect(() => attachCanvasBlock(a, s, "pool")).toThrow("Round robin");
    a = attachCanvasBlock(a, s, "playoff").answers;
    expect(() => attachCanvasBlock(a, s, "monrad")).toThrow("last stage");
    expect(rowStages(a, d.key).map((x) => x.kind)).toEqual(["swiss", "knockout"]);
  });
  it("preserves custom RR matchups rather than silently resizing them", () => {
    let a = addCanvasDivision(empty()); const d = canvasProjection(a).items[0];
    a = attachCanvasBlock(a, d, "round_robin").answers;
    a.stagePlans[d.key][0].rrTopology = { mode: "custom", edges: [[0, 0]], sizes: [8] };
    const s = canvasProjection(a).items.find((n) => n.type === "stage"); if (!s) throw new Error("stage");
    expect(() => attachCanvasBlock(a, s, "pool")).toThrow("custom group matrix");
    expect(a.stagePlans[d.key][0].rrTopology.sizes).toEqual([8]);
  });
  it("uses existing validation for knockout transitions", () => {
    const a = attachCanvasBlock(addCanvasDivision(empty()), canvasProjection(addCanvasDivision(empty())).items[0], "knockout").answers;
    const s = canvasProjection(a).items.find((n) => n.type === "stage"); if (!s) throw new Error("stage");
    const next = attachCanvasBlock(a, s, "monrad").answers;
    expect(validateStagePlan(rowStages(next, s.key), { entrants: 8 }).some((e) => e.level === "error")).toBe(true);
    expect(a.stagePlans[s.key]).toHaveLength(1);
  });
  it("is inaccessible outside Riverside isolated previews or when editing existing tournaments", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(visualStructurePilot(id, true, "localhost")).toBe(true);
    expect(visualStructurePilot(id, true, "id-preview--example.lovable.app")).toBe(true);
    expect(visualStructurePilot(id, true, "squashhub.lovable.app")).toBe(true);
    expect(visualStructurePilot(id, true, "riverside.squashhub.co.za")).toBe(true);
    expect(visualStructurePilot("other-club", true, "riverside.squashhub.co.za")).toBe(false);
    expect(visualStructurePilot(id, false, "localhost")).toBe(false);
    expect(visualStructurePilot(id, true, "localhost", "existing")).toBe(false);
    expect(visualStructurePilot(id, true, "localhost", "existing")).toBe(false);
  });
});