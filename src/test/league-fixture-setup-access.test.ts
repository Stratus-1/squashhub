import { describe, expect, it } from "vitest";
import { canManageLeagueFixtureSetup } from "@/lib/leagues/fixture-setup-access";

describe("league permission for fixture setup", () => {
  const nsc = { isDevice: false, hasLeaguePermission: true, memberClubId: "nsc", fixtureClubIds: ["nsc"] };
  it("recognises Vian's existing leagues grant without full-admin status", () => {
    expect(canManageLeagueFixtureSetup(nsc)).toBe(true);
  });
  it("does not extend an ordinary team captain's access to other teams", () => {
    expect(canManageLeagueFixtureSetup({ ...nsc, hasLeaguePermission: false })).toBe(false);
  });
  it("does not grant another club's fixture setup", () => {
    expect(canManageLeagueFixtureSetup({ ...nsc, fixtureClubIds: ["other"] })).toBe(false);
  });
  it("never grants device links league-management authority", () => {
    expect(canManageLeagueFixtureSetup({ ...nsc, isDevice: true })).toBe(false);
  });
});