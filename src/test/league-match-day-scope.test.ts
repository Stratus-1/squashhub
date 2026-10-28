import { describe, expect, it } from "vitest";
import { isClubLeagueScope } from "@/lib/leagues/terminology";

describe("league Match Day Access scope", () => {
  it("allows internal Club Leagues", () => {
    expect(isClubLeagueScope("internal")).toBe(true);
  });

  it("excludes regional System Leagues", () => {
    expect(isClubLeagueScope("region")).toBe(false);
  });

  it("excludes platform and unknown scopes", () => {
    for (const scope of ["national", "system", null, undefined]) {
      expect(isClubLeagueScope(scope)).toBe(false);
    }
  });
});