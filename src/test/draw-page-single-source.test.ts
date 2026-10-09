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
  it("shows a compact read-only category summary with match format and a setup link", () => {
    expect(source).toContain("Categories (from setup — read only)");
    expect(source).toContain("Match format");
    expect(source).toContain("Change in setup");
    expect(source).toContain("I confirm this is the final format for these entries.");
    expect(source).toContain("draw-recipient-picker");
    expect(source).not.toContain("Number of pools");
  });
});