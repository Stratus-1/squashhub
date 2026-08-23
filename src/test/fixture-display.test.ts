import { describe, it, expect } from "vitest";
import {
  fixtureTeamDisplayName,
  fixtureSideName,
  hasFixtureTeamName,
  isByeCode,
} from "@/lib/leagues/fixture-display";

describe("fixture-display (Phase 2 season-safe names)", () => {
  it("prefers the historical snapshot over the live name", () => {
    expect(
      fixtureTeamDisplayName({ snapshot: "Nelspruit A 2026", code: "NIL001", liveName: "Nelspruit A 2027" }),
    ).toBe("Nelspruit A 2026");
  });

  it("falls back to the live name when no snapshot exists (legacy rows)", () => {
    expect(fixtureTeamDisplayName({ snapshot: null, code: "CSIL01", liveName: "CSIR Legacy" })).toBe("CSIR Legacy");
  });

  it("falls back to the code when nothing else resolves", () => {
    expect(fixtureTeamDisplayName({ snapshot: null, code: "LG001", liveName: null })).toBe("LG001");
  });

  it("treats blank strings as missing", () => {
    expect(fixtureTeamDisplayName({ snapshot: "  ", code: "NIL002", liveName: "  " })).toBe("NIL002");
  });

  it("renders BYE regardless of snapshot", () => {
    expect(isByeCode("__BYE__")).toBe(true);
    expect(fixtureTeamDisplayName({ snapshot: "Whatever", code: "__BYE__" })).toBe("BYE");
  });

  it("reads either side of a fixture row", () => {
    const fixture = {
      home_team_code: "NIL004",
      away_team_code: "NIL009",
      home_team_name_snapshot: "Home 2026",
      away_team_name_snapshot: null,
    };
    expect(fixtureSideName(fixture, "home", { NIL004: "Home 2027" })).toBe("Home 2026");
    expect(fixtureSideName(fixture, "away", { NIL009: "Away Live" })).toBe("Away Live");
    expect(fixtureSideName(fixture, "away", {})).toBe("NIL009");
  });

  it("hasFixtureTeamName is false when only the code is available", () => {
    const fixture = {
      home_team_code: "LG001",
      away_team_code: "NIL004",
      home_team_name_snapshot: null,
      away_team_name_snapshot: "Snapshot Name",
    };
    expect(hasFixtureTeamName(fixture, "home", {})).toBe(false);
    expect(hasFixtureTeamName(fixture, "away", {})).toBe(true);
  });

  it("is stable when the current team name changes (rename simulation)", () => {
    const fixture = {
      home_team_code: "NIL004",
      away_team_code: "NIL009",
      home_team_name_snapshot: "Old Legends 2026",
      away_team_name_snapshot: "Old Rivals 2026",
    };
    const before = fixtureSideName(fixture, "home", { NIL004: "Old Legends 2026" });
    const after = fixtureSideName(fixture, "home", { NIL004: "Brand New Name 2027" });
    expect(before).toBe(after);
  });
});
