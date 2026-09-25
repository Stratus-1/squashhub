import { describe, expect, it } from "vitest";
import { DefinitionSchema } from "@/lib/smart-builder/definition";
import { presetDefinition } from "@/lib/smart-builder/quick-path";
import { diamondTemplate } from "@/lib/smart-builder/stage-builder";
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
  it("Diamond pool-v-pool singles→doubles is flagged at design time, not only at Review", () => {
    const def = presetDefinition("custom"); diamondTemplate(def);
    const v = validateDefinition(def);
    expect(v.issues.some((i) => i.code === "engine_unsupported" && i.level === "error")).toBe(true);
    const r = assessReadiness(def, v, mapToExistingTournament(def));
    const checks = r.sections.find((s) => s.title === "Ready to create")!;
    expect(checks.items.map((i) => i.label)).toEqual(["Structure valid", "Engine supported", "Schedule feasible", "Scoring complete"]);
    expect(checks.items.find((i) => i.id === "check_engine")!.state).toBe("missing");
    expect(() => specFromDefinition(def)).toThrow(/pool-v-pool/);
  });

  it("an exactly-representable pool-v-pool singles stage is translated to banded position groups", () => {
    const def = crossPoolSingles();
    expect(engineVerdicts(def)[0].state).toBe("translated");
    expect(validateDefinition(def).issues.some((i) => i.code === "engine_unsupported")).toBe(false);
    const spec = specFromDefinition(def);
    const st = spec.divisions[0].stages[0];
    expect(st.kind).toBe("pools");
    expect(st.pools).toBe(3); // one group per pool position
    expect(st.poolSize).toBe(4); // one player from each pool
    expect(spec.divisions[0].seeding.method).toBe("banded");
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
