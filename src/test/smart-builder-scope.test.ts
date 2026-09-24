import { describe, it, expect } from "vitest";
import { recommendSeeding, seedingPriority } from "@/lib/smart-builder/scope";

describe("scope-aware seeding", () => {
  it("defaults by scope", () => {
    expect(seedingPriority("club")[0]).toBe("club_ladder");
    expect(seedingPriority("regional")[0]).toBe("regional");
    expect(seedingPriority("national")[0]).toBe("national");
  });
  it("skips a source with weak coverage and never invents values", () => {
    expect(recommendSeeding("national", { eligible: 100, bySource: { national: 20, regional: 80 } })).toEqual({ source: "regional", covered: 80, missing: 20 });
    expect(recommendSeeding("club", { eligible: 10, bySource: {} })).toEqual({ source: "manual", covered: 0, missing: 10 });
  });
});
