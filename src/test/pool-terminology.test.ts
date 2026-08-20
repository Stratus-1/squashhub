import { describe, it, expect } from "vitest";
import { poolLabel, poolLabelFor, poolNoun, poolSelectorLabel } from "@/lib/tournaments/divisions";

describe("knockout uses sections, other formats use pools", () => {
  it("labels knockout counts as sections", () => {
    expect(poolLabelFor(1, "knockout")).toBe("1 draw");
    expect(poolLabelFor(2, "knockout")).toBe("2 sections");
    expect(poolLabelFor(4, "knockout")).toBe("4 sections");
    expect(poolLabelFor(8, "knockout")).toBe("8 sections");
  });

  it("keeps pool wording for non-knockout formats", () => {
    for (const fmt of ["single_round_robin", "double_round_robin", "swiss", "cross_league"]) {
      expect(poolLabelFor(2, fmt)).toBe("2 pools");
      expect(poolSelectorLabel(fmt)).toBe("Pools");
      expect(poolNoun(fmt, false)).toBe("pool");
    }
    expect(poolSelectorLabel("knockout")).toBe("Sections");
    expect(poolNoun("knockout", false)).toBe("section");
  });

  it("keeps the legacy poolLabel helper unchanged", () => {
    expect(poolLabel(1)).toBe("1 draw");
    expect(poolLabel(4)).toBe("4 pools");
  });
});
