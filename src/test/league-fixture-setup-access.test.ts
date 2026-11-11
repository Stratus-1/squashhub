import { describe, expect, it } from "vitest";
import { canEditSubmittedLeagueScores, canManageLeagueFixtureSetup } from "@/lib/leagues/fixture-setup-access";

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
describe("editing submitted league scores", () => {
  const base = { isDevice: false, isClubAdmin: false, hasLeaguePermission: true, memberClubId: "nsc", fixtureClubIds: ["nsc"] };
  it("lets a Leagues permission holder edit submitted scores at their own club", () => {
    expect(canEditSubmittedLeagueScores(base)).toBe(true);
  });
  it("does not let an ordinary member without the Leagues permission edit them", () => {
    expect(canEditSubmittedLeagueScores({ ...base, hasLeaguePermission: false })).toBe(false);
  });
  it("does not let a Leagues permission holder edit another club's fixture", () => {
    expect(canEditSubmittedLeagueScores({ ...base, fixtureClubIds: ["other"] })).toBe(false);
  });
  it("keeps club admins able to edit", () => {
    expect(canEditSubmittedLeagueScores({ ...base, hasLeaguePermission: false, isClubAdmin: true })).toBe(true);
  });
  it("never lets a Match Day device link edit submitted scores", () => {
    expect(canEditSubmittedLeagueScores({ ...base, isDevice: true, isClubAdmin: true })).toBe(false);
  });
});
