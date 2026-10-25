import { describe, expect, it } from "vitest";
import { categoryDisplayName, categoryLabelOnlyChange } from "@/lib/smart-builder/category-labels";
import { getGroupLabel } from "@/lib/tournament-formats/group-labels";

describe("saved category name identity", () => {
  it("resolves the replacement name through its unchanged tournament group and unit key", () => {
    const answers = { categoryLabels: { Open: "GW Doubles" }, originalStructure: { _unit_keys: ["Open"] } };
    expect(getGroupLabel({ group_labels: { "1": "Open · Doubles" }, beta_lifecycle: { answers } }, 1)).toBe("GW Doubles");
    expect(categoryDisplayName(answers, "Open")).toBe("GW Doubles");
  });
  it("identifies name-only edits but never treats pool changes as name-only", () => {
    const before = { categories: ["Open"], stagePlans: { Open: [{ id: "s", pools: 6 }] }, originalStructure: { group_labels: { "1": "Open" }, category_locks: {} } };
    const after = { ...before, categoryLabels: { Open: "GW Doubles" }, originalStructure: { ...before.originalStructure, group_labels: { "1": "GW Doubles" }, category_locks: { Open: true } } };
    expect(categoryLabelOnlyChange(before, after)).toBe(true);
    expect(categoryLabelOnlyChange(before, { ...after, stagePlans: { Open: [{ id: "s", pools: 1 }] } })).toBe(false);
  });
  it("retains sibling labels and legacy fallback", () => {
    const champ = { group_labels: { "1": "Open", "2": "Ladies" }, beta_lifecycle: { answers: { originalStructure: { _unit_keys: ["Open", "Ladies"] }, categoryLabels: { Open: "GW Doubles" } } } };
    expect(getGroupLabel(champ, 2)).toBe("Ladies");
    expect(getGroupLabel({ group_labels: { "1": "Open" } }, 1)).toBe("Open");
  });
});