import { describe, expect, it } from "vitest";
import { composeStageLabel } from "@/lib/tournaments/knockout";

describe("composeStageLabel", () => {
  it("demotes a section's final to a semi-final (the section winners still meet)", () => {
    expect(composeStageLabel("Final", "Section B")).toBe("Section B · Semi-final");
  });

  it("leaves other section stages alone", () => {
    expect(composeStageLabel("Semi-final", "Section A")).toBe("Section A · Semi-final");
    expect(composeStageLabel("Quarter-final", "Section A")).toBe("Section A · Quarter-final");
  });

  it("keeps the real final for a single-section league", () => {
    expect(composeStageLabel("Final")).toBe("Final");
  });

  it("keeps the league-wide play-off bracket's final", () => {
    expect(composeStageLabel("Final", "League finals")).toBe("League finals · Final");
  });
});
