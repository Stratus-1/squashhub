import { describe, it, expect } from "vitest";
import { combinedFamilyTotal } from "@/lib/family/family-package";

describe("combined family total", () => {
  it("charges the additional fee only for the extra people, not the primary", () => {
    // Family Package R1600 + one son at R120 => R1720 (never R1840)
    expect(combinedFamilyTotal(1600, 120, 1)).toBe(1720);
  });

  it("is just the package fee when nobody else is linked", () => {
    expect(combinedFamilyTotal(1600, 120, 0)).toBe(1600);
  });
});
