import { describe, it, expect } from "vitest";
import {
  regionEquivalentLeagueIds,
  regionLeagueIdsToResolve,
  widenRegistrationsRegionwide,
} from "@/lib/tournaments/region-eligibility";
import { findIneligibleAssignments, type EligibilityContext } from "@/lib/tournaments/divisions";

const host = [
  { id: "host-6", level: 6, season_year: 2026, is_reserve: false },
  { id: "host-7", level: 7, season_year: 2026, is_reserve: false },
  { id: "host-x", level: null, season_year: 2026, is_reserve: false },
];

const region = [
  { league_id: "host-6", level: 6, season_year: 2026, is_reserve: false },
  { league_id: "other-6", level: 6, season_year: 2026, is_reserve: false },
  { league_id: "third-6", level: 6, season_year: 2026, is_reserve: false },
  { league_id: "other-6-res", level: 6, season_year: 2026, is_reserve: true },
  { league_id: "other-6-2025", level: 6, season_year: 2025, is_reserve: false },
  { league_id: "other-7", level: 7, season_year: 2026, is_reserve: false },
];

describe("region eligibility", () => {
  it("matches leagues across clubs on level, season and reserve status", () => {
    const eq = regionEquivalentLeagueIds(host, region);
    expect(eq.get("host-6")!.sort()).toEqual(["host-6", "other-6", "third-6"]);
    expect(eq.get("host-7")!.sort()).toEqual(["host-7", "other-7"]);
  });

  it("never matches a league with no level", () => {
    const eq = regionEquivalentLeagueIds(host, region);
    expect(eq.get("host-x")).toEqual(["host-x"]);
  });

  it("lists only the foreign leagues that still need resolving", () => {
    const ids = regionLeagueIdsToResolve(regionEquivalentLeagueIds(host, region)).sort();
    expect(ids).toEqual(["other-6", "other-7", "third-6"]);
  });

  it("clears the ineligible warning for a player in another club's same league", () => {
    const eq = regionEquivalentLeagueIds(host, region);
    const base = new Map<string, string[]>([["host-6", ["home-player"]]]);
    const widened = widenRegistrationsRegionwide({
      base,
      equivalents: eq,
      regionMembersByLeague: new Map([["other-6", ["away-player"]]]),
    });

    const ctx = (regs: Map<string, string[]>): EligibilityContext => ({
      sources: { "1": { mode: "selected", leagueIds: ["host-6"] } },
      allLeagueIds: host.map((h) => h.id),
      registrationsByLeague: regs,
    });
    const assignments = new Map([["away-player", 1]]);

    expect(findIneligibleAssignments(assignments, ctx(base))).toHaveLength(1);
    expect(findIneligibleAssignments(assignments, ctx(widened))).toHaveLength(0);
  });

  it("still flags a player who is in a different level", () => {
    const eq = regionEquivalentLeagueIds(host, region);
    const widened = widenRegistrationsRegionwide({
      base: new Map(),
      equivalents: eq,
      regionMembersByLeague: new Map([["other-7", ["seventh-player"]]]),
    });
    const ctx: EligibilityContext = {
      sources: { "1": { mode: "selected", leagueIds: ["host-6"] } },
      allLeagueIds: host.map((h) => h.id),
      registrationsByLeague: widened,
    };
    expect(findIneligibleAssignments(new Map([["seventh-player", 1]]), ctx)).toHaveLength(1);
  });
});
