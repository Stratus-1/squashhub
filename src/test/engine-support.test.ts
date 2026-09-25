import { describe, expect, it } from "vitest";
import { DefinitionSchema } from "@/lib/smart-builder/definition";
import { engineVerdicts } from "@/lib/smart-builder/engine-support";
import { validateDefinition } from "@/lib/smart-builder/validate";
import { mapToExistingTournament } from "@/lib/smart-builder/to-existing";
import { assessReadiness } from "@/lib/smart-builder/readiness";
import { specFromDefinition } from "@/lib/tournaments/structured-persist";
import { stageMatch } from "@/lib/smart-builder/court-allocation";

const crossPoolSingles = () => DefinitionSchema.parse({
  name: "Position groups", divisions: [{ id: "d", name: "Open", sections: [{ id: "s", name: "Main", stages: [{
    id: "cp", name: "Singles", kind: "cross_pool_league", discipline: "singles", groups: 4, groupSize: 3, legs: 1, input: { entrants: 12 },
    tieFormat: { pairing: "position", sameCourt: true, rubbers: [1, 2, 3].map((p) => ({ discipline: "singles", positions: [p], minutes: 20 })) },
    schedule: { mode: "fixed", roundDates: ["2026-10-07", "2026-10-14", "2026-10-21"] },
  }] }] }],
});

describe("engine capability is a design-time hard constraint", () => {
  it("pool-v-pool stages with a complete mapping are engine-supported; an incomplete one blocks at design time", () => {
    const def = crossPoolSingles();
    expect(engineVerdicts(def)[0].state).toBe("supported");
    const spec = specFromDefinition(def);
    expect(spec.divisions[0].stages[0].kind).toBe("mapped");
    const broken = crossPoolSingles();
    broken.divisions[0].sections[0].stages[0].tieFormat!.pairing = null;
    const v = validateDefinition(broken);
    expect(v.issues.some((i) => i.code === "engine_unsupported" && i.level === "error")).toBe(true);
    const r = assessReadiness(broken, v, mapToExistingTournament(broken));
    const checks = r.sections.find((s) => s.title === "Ready to create")!;
    expect(checks.items.map((i) => i.label)).toEqual(["Structure valid", "Engine supported", "Schedule feasible", "Scoring complete"]);
    expect(checks.items.find((i) => i.id === "check_engine")!.state).toBe("missing");
    expect(() => specFromDefinition(broken)).toThrow();
  });

  it("Bells time cap is scoring only — duration comes from match minutes", () => {
    const def = DefinitionSchema.parse({ name: "B", divisions: [{ id: "d", name: "O", sections: [{ id: "s", name: "M", stages: [
      { id: "rr", name: "RR", kind: "round_robin", groups: 1, groupSize: 4, scoring: { mode: "time_capped_points", timeCapMinutes: 15 }, schedule: { mode: "fixed" } },
    ] }] }] });
    const st = def.divisions[0].sections[0].stages[0];
    expect(stageMatch(def, st).minutes).toBeNull();
    st.schedule.matchMinutes = 20;
    expect(stageMatch(def, st).minutes).toBe(20);
  });
});
