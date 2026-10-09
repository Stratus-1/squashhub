import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/smart-builder/StepGenerateDrawPanel.tsx", "utf8");

describe("Generate draw presentation", () => {
  it("does not repeat setup schedule or seeding selectors", () => {
    expect(source).not.toContain("When games are played");
    expect(source).not.toContain("Games per round and due dates");
    expect(source).not.toContain("value={f.seeding}");
    expect(source).not.toContain("{p.schedule}");
  });
  it("keeps scoring and confirmation but only renders player tables for pools", () => {
    expect(source).toContain("Match format (from setup)");
    expect(source).toContain("I confirm this is the final format for these entries.");
    expect(source).toContain("if (!isPools) return null;");
    expect(source).toContain("Expand pools full screen");
  });
});