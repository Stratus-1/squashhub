import { describe, it, expect } from "vitest";
import { presetDefinition, quickQuestions, setPlayoffs, setPools, syncDivisions, tournamentMap, tournamentMapBlocks, QUICK_PATHS, derivePoolShape } from "@/lib/smart-builder/quick-path";
import { DefinitionSchema } from "@/lib/smart-builder/definition";
import { specFromDefinition } from "@/lib/tournaments/structured-persist";
import { generateFromSpec } from "@/lib/tournaments/engine-service";

const specWith = (def: any, n: number) => {
  def.divisions[0].sections[0].stages.forEach((s: any) => { s.schedule = { mode: "fixed", startDate: "2026-10-01", roundDates: ["2026-10-01"] }; });
  const spec = specFromDefinition(DefinitionSchema.parse(def));
  spec.divisions.forEach((d) => { d.entrants = Array.from({ length: n }, (_, i) => ({ id: `${d.divisionId}-p${i + 1}`, rank: i + 1 })); d.expectedEntrants = n; });
  return spec;
};

describe("fast path: format, grouping and progression are separate layers", () => {
  it("offers formats only — no combined 'pools then play-offs' choice", () => {
    expect(QUICK_PATHS.map((p) => p.key)).toEqual(["round_robin", "swiss", "knockout", "custom"]);
  });
  it("progressive disclosure: pools question first, play-offs only after it is answered", () => {
    const def = presetDefinition("round_robin");
    expect(quickQuestions(def)).toMatchObject({ poolsToggle: true, pools: false, playoffToggle: false, playoffs: false });
    setPools(def, false);
    expect(quickQuestions(def)).toMatchObject({ pools: false, playoffToggle: true, playoffs: false });
    setPlayoffs(def, true);
    expect(quickQuestions(def).playoffs).toBe(true);
    setPlayoffs(def, false);
    expect(def.divisions[0].sections[0].stages).toHaveLength(1);
  });
  it("swiss asks no pool question; knockout asks neither pools nor play-offs", () => {
    expect(quickQuestions(presetDefinition("swiss"))).toMatchObject({ swiss: true, poolsToggle: false, playoffToggle: true });
    expect(quickQuestions(presetDefinition("knockout"))).toMatchObject({ poolsToggle: false, playoffToggle: false, thirdPlace: true });
  });
  it("A) 10 players, RR, no pools, no play-offs", () => {
    const def = presetDefinition("round_robin"); setPools(def, false); setPlayoffs(def, false);
    const fx = generateFromSpec(specWith(def, 10), "t");
    expect(fx).toHaveLength(45);
  });
  it("B) 24 players, RR in 4 pools of 6, top 2 → QF/SF/F", () => {
    const def = presetDefinition("round_robin"); setPools(def, true, 4);
    const s = def.divisions[0].sections[0].stages[0]; s.groups = 4; s.groupSize = 6; s.input.entrants = 24;
    setPlayoffs(def, true, 2);
    expect(def.divisions[0].sections[0].stages[1].qualifierMapping).toBe("cross_pool");
    const fx = generateFromSpec(specWith(def, 24), "t");
    expect(fx.filter((f) => f.stageKind === "pools")).toHaveLength(60);
    const b = tournamentMapBlocks(def)[0].lines.join("\n");
    expect(b).toContain("Stage 1 — Round robin"); expect(b).toContain("4 pools × 6");
    expect(b).toContain("Top 2 from each pool"); expect(b).toContain("Quarter-final → Semi-final → Final");
  });
  it("C) 40 players, Swiss one field, 5 rounds, top 8 → knockout", () => {
    const def = presetDefinition("swiss"); def.divisions[0].sections[0].stages[0].input.entrants = 40;
    setPlayoffs(def, true, 8);
    expect(def.divisions[0].sections[0].stages[0].groups).toBe(1);
    const b = tournamentMapBlocks(def)[0].lines.join("\n");
    expect(b).toContain("Swiss · 5 rounds"); expect(b).toContain("Top 8 qualify"); expect(b).toContain("Quarter-final → Semi-final → Final");
    expect(generateFromSpec(specWith(def, 40), "t").length).toBe(20);
  });
  it("E) straight knockout runs through the one engine", () => {
    const fx = generateFromSpec(specWith(presetDefinition("knockout"), 8), "t");
    expect(fx.length).toBeGreaterThan(0);
    expect(fx.every((f) => f.poolId === null)).toBe(true);
  });
  it("pool count and size derive from each other", () => {
    expect(derivePoolShape(24, 4, null)).toEqual({ groups: 4, size: 6 });
    expect(derivePoolShape(24, null, 6)).toEqual({ groups: 4, size: 6 });
  });
  it("legacy pools_playoffs drafts still read as round robin", () => {
    const def: any = presetDefinition("round_robin"); def.quickPath = "pools_playoffs"; setPools(def, true);
    expect(quickQuestions(def).pools).toBe(true);
    expect(tournamentMap(def)[0]).toContain("Round robin in 2 pools");
  });
  it("extra divisions share the structure with their own ids", () => {
    const def = presetDefinition("round_robin"); setPools(def, true); setPlayoffs(def, true);
    def.divisions.push({ ...JSON.parse(JSON.stringify(def.divisions[0])), id: "div2", name: "Ladies" });
    syncDivisions(def);
    const [a, b] = def.divisions;
    expect(b.sections[0].stages[0].id).not.toBe(a.sections[0].stages[0].id);
    expect(b.sections[0].stages[1].input.fromStageId).toBe(b.sections[0].stages[0].id);
  });
});
