import { describe, it, expect } from "vitest";
import { DefinitionSchema, type TournamentDefinition } from "@/lib/smart-builder/definition";
import { definedOnly, deferredStages, hasDeferred } from "@/lib/smart-builder/deferred";
import { validateDefinition } from "@/lib/smart-builder/validate";
import { assessReadiness } from "@/lib/smart-builder/readiness";
import { mapToExistingTournament } from "@/lib/smart-builder/to-existing";
import { engineVerdicts } from "@/lib/smart-builder/engine-support";
import { scheduleMaths } from "@/lib/smart-builder/schedule-maths";
import { specFromDefinition } from "@/lib/tournaments/structured-persist";

/** Pools stage that can run now + a semi-final and a final deliberately left for later. */
function draft(defineLater = true): TournamentDefinition {
  return DefinitionSchema.parse({
    name: "Club champs",
    event: { scope: "club", ownerId: "club-1", ownerName: "Club", audience: "all_members", expectedEntries: 16, seedingSource: "club_ladder", venues: { mode: "single", clubIds: ["club-1"], names: ["Club"], courtIds: { "club-1": [1, 2] } } },
    scheduleDefaults: { startDate: "2026-10-07", endDate: "2026-11-04", matchMinutes: 30, courtsPerVenue: 2, sessionMinutes: 180 },
    scoring: { mode: "standard", pointsPerGame: 11, bestOf: 5 },
    divisions: [{
      id: "d1", name: "Division 1", eligibility: "open", entry: "individual",
      sections: [{ id: "s1", name: "Main", stages: [
        { id: "st1", name: "Pools", kind: "round_robin", discipline: "singles", groups: 4, groupSize: 4, input: { entrants: 16 }, advance: { role: "qualify", perGroup: 2 }, schedule: { mode: "fixed", startDate: "2026-10-07", endDate: "2026-10-21", roundDates: ["2026-10-07", "2026-10-14", "2026-10-21"], matchMinutes: 30, courtsPerVenue: 2, sessionMinutes: 180, venueClubIds: ["club-1"] } },
        { id: "st2", name: "Semi Finals", kind: "knockout", discipline: "singles", groups: 1, groupSize: null, defineLater, input: { fromStageId: "st1" }, advance: { role: "none" }, schedule: { mode: "unset", startDate: "2026-10-28" } },
        { id: "st3", name: "Final", kind: "knockout", discipline: "singles", groups: 1, groupSize: null, defineLater, input: { fromStageId: "st2" }, advance: { role: "none" }, schedule: { mode: "unset" } },
      ] }],
    }],
  });
}

describe("define later stages", () => {
  it("is an intentional state, not an error: the deferred stages are listed and validation has no errors from them", () => {
    const def = draft();
    expect(hasDeferred(def)).toBe(true);
    const later = deferredStages(def);
    expect(later.map((l) => l.stageName)).toEqual(["Semi Finals", "Final"]);
    expect(later[0].plannedDate).toBe("2026-10-28"); // an entered date stays a planning target
    const v = validateDefinition(def);
    expect(v.issues.filter((i) => i.level === "error" && (i.stageId === "st2" || i.stageId === "st3"))).toEqual([]);
    expect(v.issues.filter((i) => i.code === "define_later")).toHaveLength(2);
  });

  it("excludes deferred stages from structure, engine, schedule and scoring checks", () => {
    const def = draft();
    expect(definedOnly(def).divisions[0].sections[0].stages.map((s) => s.id)).toEqual(["st1"]);
    expect(engineVerdicts(def).filter((v) => v.state === "unsupported")).toEqual([]);
    expect(engineVerdicts(def).filter((v) => v.state === "deferred")).toHaveLength(2);
    expect(scheduleMaths(def).issues.filter((i) => i.stageId === "st2" || i.stageId === "st3")).toEqual([]);
  });

  it("the same draft DOES report the missing information once the stages are defined", () => {
    const v = validateDefinition(draft(false));
    expect(v.issues.some((i) => i.level === "error" && i.stageId === "st2")).toBe(true);
  });

  it("stays creatable: engine support is ready and Review lists the later stages", () => {
    const def = draft();
    const mapping = mapToExistingTournament(def);
    expect(mapping.executability).toBe("ready");
    expect(mapping.laterStages.map((l) => l.stage)).toEqual(["Semi Finals", "Final"]);
    const r = assessReadiness(def, validateDefinition(def), mapping);
    const checks = r.sections.find((s) => s.title === "Ready to create")!;
    expect(checks.items.find((i) => i.id === "check_engine")!.state).toBe("complete");
    expect(checks.items.find((i) => i.id === "check_structure")!.state).toBe("complete");
    expect(r.missing.some((m) => m.stageId === "st2" || m.stageId === "st3")).toBe(false);
    const later = r.sections.flatMap((s) => s.items).find((i) => i.id === "later_stages")!;
    expect(later.state).toBe("complete");
    expect(later.detail).toContain("Semi Finals — Define later");
  });

  it("never creates or advances into a deferred stage — it is a planning target on the spec only", () => {
    const spec = specFromDefinition(draft());
    expect(spec.divisions[0].stages.map((s) => s.name)).toEqual(["Pools"]);
    expect(spec.divisions[0].deferredStages).toEqual([
      { stageKey: "st2", name: "Semi Finals", plannedDate: "2026-10-28" },
      { stageKey: "st3", name: "Final", plannedDate: null },
    ]);
  });

  it("once defined, the stage is created like any other and must pass the normal checks", () => {
    const def = draft();
    const st = def.divisions[0].sections[0].stages[1];
    st.defineLater = undefined;
    st.groupSize = 4;
    st.qualifierMapping = "cross_pool";
    st.generation = "owner_approval";
    def.divisions[0].sections[0].stages = def.divisions[0].sections[0].stages.slice(0, 2);
    const spec = specFromDefinition(def);
    expect(spec.divisions[0].stages.map((s) => s.name)).toEqual(["Pools", "Semi Finals"]);
    expect(spec.divisions[0].deferredStages).toEqual([]);
  });
});
