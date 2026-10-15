import { describe, expect, it } from "vitest";
import { retiredStructurePilotFlag } from "@/lib/smart-builder/pilot-status";

describe("retired Riverside structure pilot", () => {
  it("ignores enabled or stale old flags in Riverside", () => {
    const riverside = "11111111-1111-1111-1111-111111111111";
    expect(retiredStructurePilotFlag(riverside, true)).toBe(false);
    expect(retiredStructurePilotFlag(riverside, false)).toBe(false);
  });

  it("preserves flag behaviour in other clubs", () => {
    const uitsig = "d8397b8a-60d3-4c4b-afee-25dab218bf19";
    expect(retiredStructurePilotFlag(uitsig, true)).toBe(true);
    expect(retiredStructurePilotFlag(uitsig, false)).toBe(false);
  });
});