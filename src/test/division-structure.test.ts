import { describe, it, expect } from "vitest";
import { DefinitionSchema, type TournamentDefinition } from "@/lib/smart-builder/definition";
import { presetDefinition } from "@/lib/smart-builder/quick-path";
import { addStage, removeStage, setFormat } from "@/lib/smart-builder/stage-builder";
import { addDivision, applyPlan, applyStructure, ownershipIssues, stagesIn } from "@/lib/smart-builder/division-structure";
import { specFromDefinition } from "@/lib/tournaments/structured-persist";

const base = () => {
  const def = presetDefinition("custom");
  def.divisions[0].name = "Men";
  return def;
};
const div = (def: TournamentDefinition, name: string) => def.divisions.find((d) => d.name === name)!;
const ids = (def: TournamentDefinition, name: string) => stagesIn(div(def, name)).map((s) => s.id);

describe("divisions first, then stages per division", () => {
  it("1. adding Stage 2 to Men does not add it to Ladies", () => {
    const def = base(); addDivision(def, "Ladies", { copyFromId: def.divisions[0].id });
    addStage(div(def, "Men"));
    expect(ids(def, "Men")).toHaveLength(2);
    expect(ids(def, "Ladies")).toHaveLength(1);
  });
  it("2. a blank Ladies division has no stages", () => {
    const def = base(); addDivision(def, "Ladies");
    expect(ids(def, "Ladies")).toEqual([]);
    addStage(div(def, "Ladies"));
    expect(ids(def, "Ladies")).toHaveLength(1);
    expect(ids(def, "Men")).toHaveLength(1);
  });
  it("3 + 4. copy creates independent stage IDs; editing the copy leaves Men alone", () => {
    const def = base(); addStage(div(def, "Men"), "knockout");
    addDivision(def, "Ladies", { copyFromId: div(def, "Men").id });
    const [m, l] = [ids(def, "Men"), ids(def, "Ladies")];
    expect(l).toHaveLength(2); expect(l.some((x) => m.includes(x))).toBe(false);
    expect(stagesIn(div(def, "Ladies"))[1].input.fromStageId).toBe(l[0]);
    const menBefore = JSON.stringify(div(def, "Men"));
    const ls2 = stagesIn(div(def, "Ladies"))[1];
    setFormat(div(def, "Ladies"), ls2.id, "round_robin"); ls2.groups = 3; ls2.schedule = { mode: "play_by" } as any;
    expect(JSON.stringify(div(def, "Men"))).toBe(menBefore);
    expect(ownershipIssues(def)).toEqual([]);
  });
  it("5 + 6. copied pools and cross-pool mappings resolve to the destination division", () => {
    const def = base(); const men = div(def, "Men");
    men.sections[0].stages[0].groups = 4;
    addStage(men, "knockout");
    const ko = men.sections[0].stages[1];
    ko.progression = { mode: "qualifiers" }; men.sections[0].stages[0].advance = { role: "qualify", perGroup: 2 } as any;
    ko.qualifierTransition = { positions: [1, 2], method: "cross_pool", poolPairs: [[0, 3], [1, 2]], pairing: "winner_runner_up" } as any;
    addDivision(def, "Ladies", { copyFromId: men.id });
    const spec = specFromDefinition(def);
    const [sm, sl] = [spec.divisions.find((d) => d.label === "Men")!, spec.divisions.find((d) => d.label === "Ladies")!];
    const poolIds = (d: typeof sm) => d.stages.flatMap((s) => s.pools?.map((p: any) => p.id) ?? []);
    expect(poolIds(sl).length).toBe(4);
    expect(poolIds(sl).some((p) => poolIds(sm).includes(p))).toBe(false);
    const lko = div(def, "Ladies").sections[0].stages[1];
    expect(lko.qualifierTransition?.poolPairs).toEqual([[0, 3], [1, 2]]);
    expect(lko.input.fromStageId).toBe(div(def, "Ladies").sections[0].stages[0].id);
    expect(JSON.stringify(sl)).not.toContain(men.sections[0].stages[0].id);
  });
  it("7. applying to several blank divisions works once and a repeat click never duplicates", () => {
    const def = base(); addStage(div(def, "Men"));
    addDivision(def, "Ladies"); addDivision(def, "Open");
    const targets = [div(def, "Ladies").id, div(def, "Open").id];
    expect(applyStructure(def, div(def, "Men").id, targets).applied).toHaveLength(2);
    expect(ids(def, "Ladies")).toHaveLength(2); expect(ids(def, "Open")).toHaveLength(2);
    const again = applyStructure(def, div(def, "Men").id, targets);
    expect(again.applied).toHaveLength(0);
    expect(ids(def, "Ladies")).toHaveLength(2);
    expect(ownershipIssues(def)).toEqual([]);
  });
  it("8 + 12. autosave/reload keeps exact division → stage ownership and order, no duplicates", () => {
    const def = base(); addStage(div(def, "Men"), "knockout");
    addDivision(def, "Ladies", { copyFromId: div(def, "Men").id }); addStage(div(def, "Ladies"), "swiss");
    const snapshot = def.divisions.map((d) => [d.id, stagesIn(d).map((s) => [s.id, s.kind])]);
    let cur = def;
    for (let i = 0; i < 3; i++) cur = DefinitionSchema.parse(JSON.parse(JSON.stringify(cur)));
    expect(cur.divisions.map((d) => [d.id, stagesIn(d).map((s) => [s.id, s.kind])])).toEqual(snapshot);
    expect(ownershipIssues(cur)).toEqual([]);
  });
  it("9. applying to a configured division needs an explicit replace", () => {
    const def = base(); addStage(div(def, "Men"));
    addDivision(def, "Ladies"); addStage(div(def, "Ladies"), "swiss");
    const t = [div(def, "Ladies").id];
    expect(applyPlan(def, div(def, "Men").id, t)[0].status).toBe("configured");
    const before = ids(def, "Ladies");
    expect(applyStructure(def, div(def, "Men").id, t).skipped[0].status).toBe("configured");
    expect(ids(def, "Ladies")).toEqual(before);
    applyStructure(def, div(def, "Men").id, t, { replaceConfigured: true });
    expect(stagesIn(div(def, "Ladies")).map((s) => s.kind)).toEqual(["round_robin", "round_robin"]);
  });
  it("10. a division with games is never overwritten, even with replace", () => {
    const def = base(); addDivision(def, "Ladies"); addStage(div(def, "Ladies"));
    const before = JSON.stringify(div(def, "Ladies"));
    const r = applyStructure(def, div(def, "Men").id, [div(def, "Ladies").id], { replaceConfigured: true, startedDivisionIds: new Set([div(def, "Ladies").id]) });
    expect(r.skipped[0].status).toBe("locked");
    expect(JSON.stringify(div(def, "Ladies"))).toBe(before);
  });
  it("11. deleting a stage in one division leaves the copied stage in the other", () => {
    const def = base(); addStage(div(def, "Men"));
    addDivision(def, "Ladies", { copyFromId: div(def, "Men").id });
    expect(removeStage(div(def, "Ladies"), ids(def, "Ladies")[1])).toBe(true);
    expect(ids(def, "Ladies")).toHaveLength(1);
    expect(ids(def, "Men")).toHaveLength(2);
  });
  it("shared stage IDs across divisions are flagged", () => {
    const def = base(); addDivision(def, "Ladies");
    div(def, "Ladies").sections[0].stages.push(JSON.parse(JSON.stringify(stagesIn(div(def, "Men"))[0])));
    expect(ownershipIssues(def).join()).toMatch(/shared/);
  });
});
