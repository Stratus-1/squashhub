import { describe, it, expect } from "vitest";
import { poolLabel, poolLabelFor, poolNoun, poolSelectorLabel } from "@/lib/tournaments/divisions";

describe("every format uses pools", () => {
  it("labels knockout counts as pools", () => {
    expect(poolLabelFor(1, "knockout")).toBe("No pools");
    expect(poolLabelFor(2, "knockout")).toBe("2 pools");
    expect(poolLabelFor(4, "knockout")).toBe("4 pools");
    expect(poolLabelFor(8, "knockout")).toBe("8 pools");
  });

  it("labels a single pool as No pools for non-knockout formats", () => {
    for (const fmt of ["single_round_robin", "double_round_robin", "swiss", "cross_league", "monrad"]) {
      expect(poolLabelFor(1, fmt)).toBe("No pools");
    }
  });

  it("keeps pool wording for non-knockout formats", () => {
    for (const fmt of ["single_round_robin", "double_round_robin", "swiss", "cross_league"]) {
      expect(poolLabelFor(2, fmt)).toBe("2 pools");
      expect(poolSelectorLabel(fmt)).toBe("Pools");
      expect(poolNoun(fmt, false)).toBe("pool");
    }
    expect(poolSelectorLabel("knockout")).toBe("Pools");
    expect(poolNoun("knockout", false)).toBe("pool");
  });

  it("keeps the legacy poolLabel helper unchanged", () => {
    expect(poolLabel(1)).toBe("1 draw");
    expect(poolLabel(4)).toBe("4 pools");
  });
});
