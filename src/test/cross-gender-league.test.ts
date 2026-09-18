import { describe, it, expect } from "vitest";
import {
  buildCrossGenderQualifications,
  crossGenderStrengthKey,
  isLadiesLeagueName,
  isMensLeagueName,
  parseLevel,
  qualifyFromRubbers,
  resolveCrossGenderSetting,
  type CrossGenderRubberRow,
} from "@/lib/leagues/cross-gender";

const row = (o: Partial<CrossGenderRubberRow>): CrossGenderRubberRow => ({
  player_code: "NSF4207",
  category: "Mens",
  league_label: "3rd",
  position: 2,
  season_year: 2026,
  won: true,
  ...o,
});

describe("cross-gender setting resolution", () => {
  it("club override wins over the association default", () => {
    expect(resolveCrossGenderSetting(true, false)).toBe(true);
    expect(resolveCrossGenderSetting(false, true)).toBe(false);
  });
  it("inherits the association default when the club has no override", () => {
    expect(resolveCrossGenderSetting(null, true)).toBe(true);
    expect(resolveCrossGenderSetting(undefined, false)).toBe(false);
  });
});

describe("qualification window", () => {
  it("qualifies on a men's rubber in the current season", () => {
    const q = qualifyFromRubbers([row({})], 2026);
    expect(q.qualifies).toBe(true);
    expect(q.rubbers).toBe(1);
  });

  it("qualifies on the previous season", () => {
    const q = qualifyFromRubbers([row({ season_year: 2025 })], 2026);
    expect(q.qualifies).toBe(true);
  });

  it("does not qualify on older history alone", () => {
    const q = qualifyFromRubbers([row({ season_year: 2023 })], 2026);
    expect(q.qualifies).toBe(false);
    expect(q.lastSeason).toBe(2023);
    expect(q.totalRubbers).toBe(1);
  });

  it("ignores ladies-league rubbers entirely", () => {
    const q = qualifyFromRubbers([row({ category: "Ladies" })], 2026);
    expect(q.qualifies).toBe(false);
    expect(q.totalRubbers).toBe(0);
  });

  it("summarises typical level and position", () => {
    const q = qualifyFromRubbers(
      [row({ league_label: "2nd", position: 1 }), row({ league_label: "4th", position: 3 })],
      2026,
    );
    expect(q.typicalLeagueLevel).toBe(3);
    expect(q.typicalPosition).toBe(2);
    expect(q.bestLeagueLevel).toBe(2);
  });
});

describe("club-wide qualification map", () => {
  it("matches members through their association numbers, ignoring formatting", () => {
    const rows = [
      row({ player_code: "nsf-4207" }),
      row({ player_code: "NSF9999", category: "Ladies" }),
      row({ player_code: "NSF1111", season_year: 2020 }),
    ];
    const codes = new Map([
      ["kaylee", ["NSF4207"]],
      ["ladies-only", ["NSF9999"]],
      ["stale", ["NSF1111"]],
      ["no-history", ["NSF0000"]],
    ]);
    const map = buildCrossGenderQualifications(rows, codes, { latestSeason: 2026 });
    expect([...map.keys()]).toEqual(["kaylee"]);
  });
});

describe("helpers", () => {
  it("reads league levels", () => {
    expect(parseLevel("3rd League")).toBe(3);
    expect(parseLevel(null)).toBeNull();
  });

  it("tells men's and ladies' team names apart", () => {
    expect(isMensLeagueName("Men's 3rd League")).toBe(true);
    expect(isMensLeagueName("Ladies 1st League")).toBe(false);
    expect(isLadiesLeagueName("Women's 2nd")).toBe(true);
  });

  it("ranks a 2nd-league #1 ahead of a 5th-league #3", () => {
    const strong = crossGenderStrengthKey(qualifyFromRubbers([row({ league_label: "2nd", position: 1 })], 2026));
    const weaker = crossGenderStrengthKey(qualifyFromRubbers([row({ league_label: "5th", position: 3 })], 2026));
    expect(strong).toBeLessThan(weaker);
  });
});

import { checkSubEligibility } from "@/lib/league-sub-eligibility";

describe("cross-gender movement cap exemption", () => {
  const rules = { max_position_movement_per_week: 2, cross_gender_subs_allowed: false } as any;

  it("lets a cross-gender lady play any men's league level", () => {
    const res = checkSubEligibility(
      rules,
      { homeLeagueNumber: 1, homePosition: 1, gender: "ladies", crossGenderLeaguePlayer: true },
      { leagueNumber: 7, position: 4, gender: "men" },
    );
    expect(res.ok).toBe(true);
  });

  it("still caps a lady who is not a cross-gender league player", () => {
    const res = checkSubEligibility(
      rules,
      { homeLeagueNumber: 1, homePosition: 1, gender: "ladies" },
      { leagueNumber: 7, position: 4, gender: "men" },
    );
    expect(res.ok).toBe(false);
  });

  it("still caps a cross-gender lady inside her own ladies league", () => {
    const res = checkSubEligibility(
      rules,
      { homeLeagueNumber: 1, homePosition: 1, gender: "ladies", crossGenderLeaguePlayer: true },
      { leagueNumber: 5, position: 4, gender: "ladies" },
    );
    expect(res.ok).toBe(false);
  });
});
