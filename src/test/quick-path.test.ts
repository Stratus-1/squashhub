import { describe, it, expect } from "vitest";
import { presetDefinition, quickQuestions, setPlayoffs, syncDivisions, tournamentMap } from "@/lib/smart-builder/quick-path";
import { DefinitionSchema } from "@/lib/smart-builder/definition";
import { specFromDefinition } from "@/lib/tournaments/structured-persist";
import { generateFromSpec } from "@/lib/tournaments/engine-service";

const withPlayers = (def: any, n: number) => {
  const spec = specFromDefinition(DefinitionSchema.parse(def));
  spec.divisions.forEach((d) => { d.entrants = Array.from({ length: n }, (_, i) => ({ id: `${d.divisionId}-p${i + 1}`, rank: i + 1 })); d.expectedEntrants = n; });
  return spec;
};

describe("fast 'I know what I want' path", () => {
  it("round robin hides pool/swiss/playoff questions until play-offs = yes", () => {
    const def = presetDefinition("round_robin");
    expect(quickQuestions(def)).toMatchObject({ pools: false, swiss: false, playoffs: false, playoffToggle: true });
    setPlayoffs(def, true);
    expect(quickQuestions(def).playoffs).toBe(true);
    setPlayoffs(def, false);
    expect(def.divisions[0].sections[0].stages).toHaveLength(1);
  });
  it("swiss shows swiss settings only", () => {
    expect(quickQuestions(presetDefinition("swiss"))).toMatchObject({ swiss: true, pools: false, playoffs: false });
    expect(quickQuestions(presetDefinition("knockout"))).toMatchObject({ swiss: false, pools: false, playoffToggle: false, playoffs: false });
    expect(quickQuestions(presetDefinition("pools_playoffs"))).toMatchObject({ pools: true, playoffs: true });
  });
  it("every simple path produces the same canonical spec and runs through the one engine", () => {
    for (const p of ["round_robin", "knockout", "pools_playoffs"] as const) {
      const def = presetDefinition(p);
      def.divisions[0].sections[0].stages.forEach((s) => { s.schedule = { mode: "fixed", startDate: "2026-10-01", roundDates: ["2026-10-01"] }; });
      const spec = withPlayers(def, 8);
      expect(spec.architecture).toBe("structured");
      const fx = generateFromSpec(spec, "t");
      expect(fx.length).toBeGreaterThan(0);
      expect(fx.every((f) => f.stageKind !== "knockout" || f.poolId === null)).toBe(true);
    }
  });
  it("a 40-player Swiss still uses the fast path", () => {
    const def = presetDefinition("swiss");
    expect(def.divisions[0].sections[0].stages[0].kind).toBe("swiss");
    def.divisions[0].sections[0].stages[0].input.entrants = 40;
    expect(tournamentMap(def)[0]).toContain("40 players");
  });
  it("extra divisions share the structure with their own ids", () => {
    const def = presetDefinition("pools_playoffs");
    def.divisions.push({ ...JSON.parse(JSON.stringify(def.divisions[0])), id: "div2", name: "Ladies" });
    syncDivisions(def);
    const [a, b] = def.divisions;
    expect(b.sections[0].stages[0].id).not.toBe(a.sections[0].stages[0].id);
    expect(b.sections[0].stages[1].input.fromStageId).toBe(b.sections[0].stages[0].id);
  });
});
