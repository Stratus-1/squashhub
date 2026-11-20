import { describe, expect, it } from "vitest";
import { displayRawGroupLabel } from "@/lib/tournament-formats/group-labels";

const beta = {
  answers: {
    originalStructure: { _unit_keys: ["Mens", "Ladies 2", "Mixed 2"] },
    categoryLabels: { "Ladies 2": "Ladies", "Mixed 2": "Mixed" },
  },
};

describe("displayRawGroupLabel", () => {
  it("applies the organiser rename and keeps the suffix", () => {
    expect(displayRawGroupLabel(beta, "Mixed 2 · Doubles", 3)).toBe("Mixed · Doubles");
    expect(displayRawGroupLabel(beta, "Ladies 2 · Doubles", 2)).toBe("Ladies · Doubles");
  });
  it("leaves un-renamed categories unchanged", () => {
    expect(displayRawGroupLabel(beta, "Mens · Doubles", 1)).toBe("Mens · Doubles");
    expect(displayRawGroupLabel(null, "Mixed 2 · Doubles", 3)).toBe("Mixed 2 · Doubles");
  });
});
