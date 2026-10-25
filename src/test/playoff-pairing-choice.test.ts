import { describe, expect, it } from "vitest";
import { choosePlayoffPairing } from "@/lib/smart-builder/playoff-pairing-choice";
import { syncPlayoffStages } from "@/lib/smart-builder/structure-playoffs";

describe("organiser playoff pairing authority", () => {
  it("uses the selected crossover in the first saved stage and retains final feeders and dates", () => {
    const stages = [{ id: "sf", unit: "Open", name: "Semifinal", phase: "playoff", pairing: "later", date: "2026-10-31" }, { id: "f", unit: "Open", name: "Final", phase: "playoff", pairing: "winners", date: "2026-10-31" }];
    expect(choosePlayoffPairing(stages, "Open", ["Open"], "cross_pools")).toEqual([{ ...stages[0], pairing: "crossover" }, stages[1]]);
    expect(stages[0].pairing).toBe("later");
  });
  it("does not change a sibling category sharing the stage", () => {
    const stages = [{ id: "sf", unit: "", name: "Semifinal", phase: "playoff", pairing: "later" }];
    expect(choosePlayoffPairing(stages, "Open", ["Open", "Ladies"], "seeded")).toEqual([{ ...stages[0], id: "sf:Open", unit: "Open", pairing: "seeded" }, { ...stages[0], id: "sf:Ladies", unit: "Ladies" }]);
    const chosen = choosePlayoffPairing(stages, "Open", ["Open", "Ladies"], "seeded");
    expect(syncPlayoffStages(chosen, { Open: ["sf"], Ladies: ["sf"] }, (name, unit) => ({ id: name, name, unit, phase: "playoff", pairing: "later" }))).toEqual(chosen);
  });
});