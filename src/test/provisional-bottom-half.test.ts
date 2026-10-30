import { describe, it, expect } from "vitest";
import { provisionalPlayoffs } from "@/lib/tournaments/provisional-playoffs";

describe("two-pool bottom half provisional play-offs", () => {
  it("adds A3 v B4, B3 v A4 semis and a plate final", () => {
    const plan = { originalStructure: { _unit_keys: ["Mixed"], league_playoff_bottom_half: { "1": true } },
      stages: [{ phase: "playoff", name: "Semifinal", pairing: "crossover" }, { phase: "playoff", name: "Final" }] };
    const labels = provisionalPlayoffs(plan, "Mixed", 2).map((g) => g.label);
    expect(labels).toEqual([
      "SF1: Pool A #1 v Pool B #2", "SF2: Pool B #1 v Pool A #2",
      "SF3: Pool A #3 v Pool B #4", "SF4: Pool B #3 v Pool A #4",
      "Final: Winner SF1 v Winner SF2", "Plate: Winner SF3 v Winner SF4",
    ]);
  });
});
