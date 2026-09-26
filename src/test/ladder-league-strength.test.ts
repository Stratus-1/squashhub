import { describe, it, expect } from "vitest";
import {
  parseLeagueLevel,
  seasonWeight,
  computeLeagueStrength,
  refineOrderFromLeagueStats,
  reconcilePendingOrder,
  describeStrength,
  type LeagueStrength,
  type RubberRow,
} from "@/lib/ladder/league-strength";

const rubber = (over: Partial<RubberRow>): RubberRow => ({
  player_code: "NSF1",
  league_label: "3rd",
  position: 2,
  season_year: 2026,
  won: true,
  ...over,
});

describe("parseLeagueLevel", () => {
  it("reads ordinal labels", () => {
    expect(parseLeagueLevel("1st")).toBe(1);
    expect(parseLeagueLevel("13th")).toBe(13);
    expect(parseLeagueLevel("League 6")).toBe(6);
    expect(parseLeagueLevel("Third")).toBe(3);
  });
  it("returns null when unknown", () => {
    expect(parseLeagueLevel(null)).toBeNull();
    expect(parseLeagueLevel("Social")).toBeNull();
  });
});

describe("seasonWeight", () => {
  it("halves per season back", () => {
    expect(seasonWeight(2026, 2026)).toBe(1);
    expect(seasonWeight(2025, 2026)).toBe(0.5);
    expect(seasonWeight(2024, 2026)).toBe(0.25);
  });
});

describe("computeLeagueStrength", () => {
  it("ranks a 1st-league number one ahead of a 6th-league number four", () => {
    const strong = computeLeagueStrength([rubber({ league_label: "1st", position: 1 })], 2026)!;
    const weak = computeLeagueStrength([rubber({ league_label: "6th", position: 4 })], 2026)!;
    expect(strong.score).toBeLessThan(weak.score);
  });

  it("weights recent seasons more heavily", () => {
    const s = computeLeagueStrength(
      [
        rubber({ league_label: "2nd", position: 1, season_year: 2026 }),
        rubber({ league_label: "8th", position: 4, season_year: 2024 }),
      ],
      2026
    )!;
    expect(s.avgLeague).toBeLessThan(5);
  });

  it("nudges by win rate but never past a full string", () => {
    const winner = computeLeagueStrength([rubber({ won: true })], 2026)!;
    const loser = computeLeagueStrength([rubber({ won: false })], 2026)!;
    expect(loser.score - winner.score).toBeCloseTo(2, 5);
  });

  it("returns null without usable rows", () => {
    expect(computeLeagueStrength([], 2026)).toBeNull();
    expect(computeLeagueStrength([rubber({ league_label: "Social", position: null })], 2026)).toBeNull();
  });
});

describe("refineOrderFromLeagueStats", () => {
  const member = (id: string) => ({ id, name: id });
  const strength = (score: number): LeagueStrength => ({
    score,
    avgPosition: 1,
    avgLeague: 1,
    rubbers: 4,
    winRate: 0.5,
  });

  it("sorts members with history and keeps the rest in place", () => {
    const current = [member("a"), member("social"), member("b"), member("c")];
    const map = new Map<string, LeagueStrength | null>([
      ["a", strength(10)],
      ["b", strength(2)],
      ["c", strength(6)],
    ]);
    const result = refineOrderFromLeagueStats(current, map);
    expect(result.order.map((m) => m.id)).toEqual(["b", "social", "c", "a"]);
    expect(result.unchangedWithoutData).toBe(1);
    expect(result.moved).toBe(3);
  });

  it("is a no-op when nobody has history", () => {
    const current = [member("a"), member("b")];
    const result = refineOrderFromLeagueStats(current, new Map());
    expect(result.order.map((m) => m.id)).toEqual(["a", "b"]);
    expect(result.moved).toBe(0);
  });
});

describe("reconcilePendingOrder", () => {
  const member = (id: string, name = id) => ({ id, name });

  it("preserves an unsaved proposal when member rows refresh", () => {
    const pending = [member("b", "Old B"), member("a", "Old A")];
    const fresh = [member("a", "Fresh A"), member("b", "Fresh B")];
    expect(reconcilePendingOrder(pending, fresh)?.map((m) => `${m.id}:${m.name}`)).toEqual([
      "b:Fresh B",
      "a:Fresh A",
    ]);
  });

  it("drops removed members and appends newly added members", () => {
    const pending = [member("b"), member("removed"), member("a")];
    const fresh = [member("a"), member("new"), member("b")];
    expect(reconcilePendingOrder(pending, fresh)?.map((m) => m.id)).toEqual(["b", "a", "new"]);
  });
});

describe("describeStrength", () => {
  it("summarises", () => {
    expect(describeStrength(null)).toMatch(/No regional league/);
    expect(
      describeStrength({ score: 5, avgPosition: 2.05, avgLeague: 3.02, rubbers: 24, winRate: 0.68 })
    ).toBe("Usually #2.1 in league 3 · 68% won (24 rubbers)");
  });
});

describe("Masters downweighting", () => {
  it("detects numbered-team divisions as Masters", () => {
    const masters = [
      { home: { name: "DBV 1" }, away: { name: "FH 1" } },
      { home: { name: "EVT 2" }, away: { name: "OM 1" } },
    ];
    const open = [
      { home: { name: "DBV A" }, away: { name: "UCT A" } },
      { home: { name: "WPCC B" }, away: { name: "VOB B" } },
    ];
    expect(isMastersDivision(masters)).toBe(true);
    expect(isMastersDivision(open)).toBe(false);
  });

  it("counts a Masters 1st league weaker than the open 1st league", () => {
    const openRows: RubberRow[] = [
      { player_code: null, league_label: "1st League", position: 2, season_year: 2026, won: true },
    ];
    const mastersRows: RubberRow[] = [
      { player_code: null, league_label: "1st League", position: 2, season_year: 2026, won: true, levelOffset: MASTERS_LEVEL_OFFSET },
    ];
    const openStrength = computeLeagueStrength(openRows, 2026)!;
    const mastersStrength = computeLeagueStrength(mastersRows, 2026)!;
    expect(mastersStrength.score).toBeGreaterThan(openStrength.score);
    expect(mastersStrength.score - openStrength.score).toBeCloseTo(MASTERS_LEVEL_OFFSET * 4, 5);
  });
});
