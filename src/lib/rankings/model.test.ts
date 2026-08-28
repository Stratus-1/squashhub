import { describe, expect, it } from "vitest";
import {
  DEFAULT_RANKING_SETTINGS as S,
  assignRanks,
  basePoints,
  buildRanking,
  leagueWeight,
  opponentFactor,
  parseLeagueLevel,
  positionWeight,
  scoreRubber,
  seasonScore,
  type RubberInput,
  type ScoredRubber,
} from "./model";

const rubber = (over: Partial<RubberInput> = {}): RubberInput => ({
  season_year: 2026,
  player_code: "NSF0001",
  player_name: "Test Player",
  category: "Men",
  league_label: "1st",
  team_code: "RIV01",
  position: 1,
  won: true,
  games_for: 3,
  games_against: 1,
  fixture_date: "2026-03-04",
  ...over,
});

describe("parseLeagueLevel", () => {
  it("reads ordinals", () => {
    expect(parseLeagueLevel("1st")).toEqual({ level: 1, isReserve: false });
    expect(parseLeagueLevel("4th")).toEqual({ level: 4, isReserve: false });
  });
  it("flags reserve leagues", () => {
    expect(parseLeagueLevel("2nd Reserve")).toEqual({ level: 2, isReserve: true });
    expect(parseLeagueLevel("3rd Res")).toEqual({ level: 3, isReserve: true });
  });
  it("falls back for unknown labels", () => {
    expect(parseLeagueLevel(null).level).toBe(3);
    expect(parseLeagueLevel("Social").level).toBe(3);
  });
});

describe("weights", () => {
  it("ranks higher leagues above lower ones", () => {
    expect(leagueWeight("1st", S)).toBeGreaterThan(leagueWeight("2nd", S));
    expect(leagueWeight("2nd", S)).toBeGreaterThan(leagueWeight("5th", S));
  });
  it("discounts reserve teams", () => {
    expect(leagueWeight("2nd Reserve", S)).toBeLessThan(leagueWeight("2nd", S));
  });
  it("rewards higher strings", () => {
    expect(positionWeight(1, S)).toBeGreaterThan(positionWeight(4, S));
    expect(positionWeight(20, S)).toBeGreaterThanOrEqual(0.5);
  });
});

describe("basePoints", () => {
  it("pays more for a win than a loss", () => {
    expect(basePoints(rubber({ won: true }), S)).toBeGreaterThan(
      basePoints(rubber({ won: false, games_for: 0, games_against: 3 }), S),
    );
  });
  it("adds a clean sweep bonus", () => {
    expect(basePoints(rubber({ won: true, games_against: 0 }), S)).toBe(S.win_points + S.clean_sweep_bonus);
  });
  it("rewards a loss taken the distance", () => {
    const close = basePoints(rubber({ won: false, games_for: 2, games_against: 3 }), S);
    const heavy = basePoints(rubber({ won: false, games_for: 0, games_against: 3 }), S);
    expect(close).toBeGreaterThan(heavy);
  });
});

describe("opponentFactor", () => {
  it("is neutral without prior rankings", () => {
    expect(opponentFactor(null, 100, S)).toBe(1);
    expect(opponentFactor(100, undefined, S)).toBe(1);
  });
  it("scales up against a stronger opponent", () => {
    expect(opponentFactor(50, 200, S)).toBeGreaterThan(1);
  });
  it("scales down against a weaker opponent", () => {
    expect(opponentFactor(200, 50, S)).toBeLessThan(1);
  });
  it("stays bounded", () => {
    expect(opponentFactor(1, 100000, S)).toBeLessThanOrEqual(1.25);
    expect(opponentFactor(100000, 1, S)).toBeGreaterThanOrEqual(0.75);
  });
});

describe("scoreRubber", () => {
  it("beats a 5th-league string 4 win with a 1st-league string 1 win", () => {
    const top = scoreRubber(rubber({ league_label: "1st", position: 1 }), S);
    const bottom = scoreRubber(rubber({ league_label: "5th", position: 4 }), S);
    expect(top.points).toBeGreaterThan(bottom.points);
  });
  it("stores an explainable breakdown", () => {
    const r = scoreRubber(rubber(), S);
    expect(r.points).toBeCloseTo(r.base_points * r.league_weight * r.position_weight * r.opponent_factor, 3);
  });
});

describe("seasonScore", () => {
  it("counts only the best N rubbers", () => {
    const pts = Array.from({ length: 20 }, (_, i) => i + 1);
    const { score, counted } = seasonScore(pts, { ...S, best_n: 3 });
    expect(counted).toBe(3);
    expect(score).toBe(20 + 19 + 18);
  });
});

describe("buildRanking", () => {
  const scored = (over: Partial<RubberInput>): ScoredRubber => scoreRubber(rubber(over), S);

  it("weights older seasons less", () => {
    const rows = buildRanking(
      [
        scored({ player_code: "A", season_year: 2026 }),
        scored({ player_code: "B", season_year: 2025 }),
      ],
      S,
      2026,
    );
    const a = rows.find((r) => r.player_code === "A")!;
    const b = rows.find((r) => r.player_code === "B")!;
    expect(a.score).toBeGreaterThan(b.score);
    expect(b.score).toBeCloseTo(a.score * 0.5, 3);
  });

  it("ignores seasons outside the decay window", () => {
    const rows = buildRanking([scored({ player_code: "OLD", season_year: 2019 })], S, 2026);
    expect(rows).toHaveLength(0);
  });

  it("sorts by score and assigns ranks with previous positions", () => {
    const rows = buildRanking(
      [
        scored({ player_code: "LOW", league_label: "5th", position: 4 }),
        scored({ player_code: "HIGH", league_label: "1st", position: 1 }),
      ],
      S,
      2026,
    );
    const ranked = assignRanks(rows, { HIGH: 4 });
    expect(ranked[0].player_code).toBe("HIGH");
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].previous_rank).toBe(4);
    expect(ranked[1].previous_rank).toBeNull();
  });

  it("breaks a score down per season", () => {
    const rows = buildRanking(
      [scored({ season_year: 2026 }), scored({ season_year: 2025, nsa_fixture_id: 2 })],
      S,
      2026,
    );
    expect(Object.keys(rows[0].season_breakdown).sort()).toEqual(["2025", "2026"]);
    expect(rows[0].rubbers_counted).toBe(2);
  });
});
