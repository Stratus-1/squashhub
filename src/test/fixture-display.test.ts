import { describe, it, expect } from "vitest";
import {
  fixtureTeamDisplayName,
  fixtureSideName,
  hasFixtureTeamName,
  isByeCode,
  buildTeamNameIndex,
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

describe("Phase 2.1 competition-aware team lookup", () => {
  const teams = [
    { code: "CSI001", nsa_team_code: "CSI001", name: "Men's 2nd League 2026", division: "Mens 2nd" },
    { code: "CSI001", nsa_team_code: "CSIL01", name: "Ladies 1st League 2026", division: "Ladies 1st" },
    { code: "NIL004", nsa_team_code: null, name: "Cobras", division: null },
  ];

  it("keeps both competitions for a shared code", () => {
    const idx = buildTeamNameIndex(teams);
    expect(idx.byDivisionCode["MENS 2ND|CSI001"]).toBe("Men's 2nd League 2026");
    expect(idx.byDivisionCode["LADIES 1ST|CSI001"]).toBe("Ladies 1st League 2026");
    expect(idx.byDivisionCode["LADIES 1ST|CSIL01"]).toBe("Ladies 1st League 2026");
  });

  it("blanks the code-only map when a code is ambiguous", () => {
    const idx = buildTeamNameIndex(teams);
    expect(idx.byCode["CSI001"]).toBeUndefined();
    expect(idx.byCode["CSIL01"]).toBe("Ladies 1st League 2026");
    expect(idx.byCode["NIL004"]).toBe("Cobras");
  });

  it("resolves a fixture side using its division", () => {
    const idx = buildTeamNameIndex(teams);
    const mens = { home_team_code: "CSI001", away_team_code: "ADE001", division: "Mens 2nd" };
    const ladies = { home_team_code: "CSI001", away_team_code: "TUKL01", division: "Ladies 1st" };
    expect(fixtureSideName(mens, "home", idx)).toBe("Men's 2nd League 2026");
    expect(fixtureSideName(ladies, "home", idx)).toBe("Ladies 1st League 2026");
  });

  it("still prefers the historical snapshot over the live index", () => {
    const idx = buildTeamNameIndex(teams);
    const f = {
      home_team_code: "CSI001",
      away_team_code: "ADE001",
      division: "Mens 2nd",
      home_team_name_snapshot: "Men's 2nd League 2026",
    };
    expect(fixtureSideName(f, "home", idx)).toBe("Men's 2nd League 2026");
  });

  it("accepts a legacy plain code->name record", () => {
    const f = { home_team_code: "NIL004", away_team_code: "NIL009" };
    expect(fixtureSideName(f, "home", { NIL004: "Cobras" })).toBe("Cobras");
  });
});
