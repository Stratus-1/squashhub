import { describe, expect, it } from "vitest";
import { adminCanOverride, adminPlacementAllowed } from "@/lib/smart-builder/admin-allocation";

describe("category admin league allocation", () => {
  const rule = { mode: "leagues", leagueIds: ["league-1", "league-2"], adminOverride: false };
  it("allows an admin to place an outside-league player when enabled", () => {
    expect(adminPlacementAllowed({ ...rule, adminOverride: true }, ["league-3"], true)).toBe(true);
  });
  it("keeps allocation within related leagues when disabled", () => {
    expect(adminPlacementAllowed(rule, ["league-3"], true)).toBe(false);
    expect(adminPlacementAllowed(rule, ["league-2"], true)).toBe(true);
  });
  it("requires explicit opt-in", () => {
    expect(adminCanOverride({ mode: "leagues", leagueIds: ["league-1"] })).toBe(false);
  });
  it("does not bypass gender eligibility", () => {
    expect(adminPlacementAllowed({ ...rule, adminOverride: true }, ["league-3"], false)).toBe(false);
  });
  it("does not restrict categories that already allow everyone", () => {
    expect(adminPlacementAllowed({ ...rule, alsoEveryone: true }, [], true)).toBe(true);
  });
  it("does not mutate related leagues", () => {
    adminPlacementAllowed({ ...rule, adminOverride: true }, ["league-3"], true);
    expect(rule.leagueIds).toEqual(["league-1", "league-2"]);
  });
});