import { describe, expect, it } from "vitest";
import { divisionPresets, structureEligibilityLabels, applyStructurePreset } from "@/lib/smart-builder/structure-rows";
import { blockedReason } from "@/lib/smart-builder/pick-entries";
import { inferCategory } from "@/lib/leagues/category";
import type { StepAnswers } from "@/components/smart-builder/StepByStepBuilder";

const base = { categories: [], subcats: {}, categoryTypes: {}, disc: {}, picks: {}, stagePlans: {}, unitEntries: {} } as unknown as StepAnswers;

describe("junior Boys/Girls category labels", () => {
  it("keeps Men/Ladies labels by default", () => {
    expect(structureEligibilityLabels().mens).toBe("Men only");
    expect(structureEligibilityLabels().ladies).toBe("Ladies only");
    expect(divisionPresets().map((p) => p.name)).toContain("Men's Singles");
  });

  it("shows Boys/Girls for junior bodies without changing stored values", () => {
    const labels = structureEligibilityLabels(true);
    expect(labels.mens).toBe("Boys only");
    expect(labels.ladies).toBe("Girls only");
    expect(labels.mixed).toBe("Mixed");
    const names = divisionPresets(true).map((p) => p.name);
    expect(names).toEqual(["Boys Singles", "Girls Singles", "Boys Doubles", "Girls Doubles", "Mixed Doubles", "Open"]);
  });

  it("junior presets still store mens/ladies eligibility", () => {
    const next = applyStructurePreset({ ...base, categories: ["A"] }, "A", "Boys Singles", true);
    expect(next.categories).toContain("Boys Singles");
    expect(next.categoryTypes?.["Boys Singles"]).toBe("mens");
    const girls = applyStructurePreset({ ...base, categories: ["A"] }, "A", "Girls Doubles", true);
    expect(girls.categoryTypes?.["Girls Doubles"]).toBe("ladies");
    expect(girls.disc?.["Girls Doubles"]).toBe("doubles");
  });

  it("infers Boys/Girls names to the right gender category", () => {
    expect(inferCategory("Boys Singles")).toBe("mens");
    expect(inferCategory("Girls U19")).toBe("ladies");
    expect(inferCategory("Mixed Doubles")).toBe("mixed");
  });

  it("blocked reasons say Boys/Girls only for junior bodies", () => {
    expect(blockedReason(false, "mens", true)).toBe("Boys only");
    expect(blockedReason(false, "ladies", true)).toBe("Girls only");
    expect(blockedReason(false, "mens")).toBe("Men only");
  });
});
