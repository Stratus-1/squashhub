import { describe, it, expect } from "vitest";
import { followUpStageGroups } from "@/lib/smart-builder/step-draw";
describe("follow-up stages are not drawn with Round 1", () => {
  it("Stage 2 waits for its first stage", () => {
    expect(followUpStageGroups(["Mens Singles A · Singles", "Mens Singles A · Stage 2 · Singles"])).toEqual({ 2: 1 });
  });
  it("ordinary categories and orphan stages are drawn normally", () => {
    expect(followUpStageGroups(["Mens A · Singles", "Ladies A · Singles"])).toEqual({});
    expect(followUpStageGroups(["Ladies A · Stage 2 · Singles"])).toEqual({});
  });
});
