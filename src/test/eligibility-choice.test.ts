import { describe, expect, it } from "vitest";
import { withoutLeagueChoice, type EligibilityChoice } from "@/lib/smart-builder/eligibility-choice";

const league: EligibilityChoice = { mode: "leagues", leagueIds: ["ladies-2"], placement: "auto", adminOverride: true };
describe("unticking Specific leagues", () => {
  it("keeps Everyone selected when removing leagues from the combined audience", () => {
    const result = withoutLeagueChoice({ ...league, alsoEveryone: true });
    expect(result.mode).toBe("everyone");
    expect(result.placement).toBe("choose");
    expect(result.leagueIds).toEqual(["ladies-2"]);
    expect(result.adminOverride).toBe(true);
  });
  it("keeps picked players only without widening to Everyone", () => {
    const result = withoutLeagueChoice({ ...league, alsoPick: true });
    expect(result.mode).toBe("manual");
    expect(result.alsoEveryone).not.toBe(true);
  });
  it("keeps Everyone and picked players when both were selected", () => {
    const result = withoutLeagueChoice({ ...league, alsoPick: true, alsoEveryone: true });
    expect(result.mode).toBe("manual");
    expect(result.alsoEveryone).toBe(true);
  });
});