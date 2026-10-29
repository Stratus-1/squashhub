import { describe, expect, it } from "vitest";
import { DEFAULT_LADDER_CONFIG } from "./eligibility";

describe("default ladder sources", () => {
  it("only ladder challenges move the ladder by default", () => {
    expect(DEFAULT_LADDER_CONFIG.ladder_from_challenges).toBe(true);
    expect(DEFAULT_LADDER_CONFIG.ladder_from_tournaments).toBe(false);
    expect(DEFAULT_LADDER_CONFIG.ladder_from_leagues).toBe(false);
    expect(DEFAULT_LADDER_CONFIG.ladder_from_system_leagues).toBe(false);
  });
});
