import { describe, expect, it } from "vitest";
import {
  computeLeagueStandings,
  leagueAverageHandicap,
  leagueSizes,
  leaguePositionLabel,
  type LeagueStanding,
} from "@/lib/tournament-formats/league-average-handicap";
import { sortDivisionEntrants } from "@/lib/tournaments/seeding";

const league = (label: string, n = 4) =>
  Array.from({ length: n }, (_, i) => ({ player_code: "x", league_label: label, category: "Mens", position: i + 1 }));

describe("league average handicap", () => {
  const sizes = leagueSizes([...league("5th"), ...league("6th"), ...league("7th")]);

  it("Marius 3.1 in 6th vs Willem 4.0 in 7th ≈ 5 points (4 rubbers per league)", () => {
    const rows = [
      ...Array(9).fill({ player_code: "M", league_label: "6th", category: "Mens", position: 3 }),
      { player_code: "M", league_label: "6th", category: "Mens", position: 4 },
      ...Array(5).fill({ player_code: "W", league_label: "7th", category: "Mens", position: 4 }),
    ];
    const s = computeLeagueStandings(rows, sizes);
    expect(s.get("M")!.avgPosition).toBeCloseTo(3.1);
    expect(s.get("W")!.index - s.get("M")!.index).toBeCloseTo(4.9);
    expect(leagueAverageHandicap(s.get("M")!.index, s.get("W")!.index)).toEqual({ handicap_a: -5, handicap_b: 0 });
  });

  it("applies the multiplier then rounds to nearest", () => {
    expect(leagueAverageHandicap(20, 24.9, 2)).toEqual({ handicap_a: -10, handicap_b: 0 });
    expect(leagueAverageHandicap(24.2, 20, 1)).toEqual({ handicap_a: 0, handicap_b: -4 });
  });

  it("uses the league played most, not occasional subs", () => {
    const rows = [
      ...Array(14).fill({ player_code: "W", league_label: "7th", category: "Mens", position: 4 }),
      ...Array(2).fill({ player_code: "W", league_label: "10th", category: "Mens", position: 1 }),
    ];
    expect(computeLeagueStandings(rows, sizes).get("W")!.division).toBe(7);
  });

  it("no data means no handicap", () => {
    expect(leagueAverageHandicap(null, 10)).toEqual({ handicap_a: 0, handicap_b: 0 });
  });

  it("keeps displayed division and average tied to the handicap index", () => {
    const rows = [
      ...Array(9).fill({ player_code: "M", league_label: "6th", category: "Mens", position: 3 }),
      { player_code: "M", league_label: "6th", category: "Mens", position: 4 },
      ...Array(5).fill({ player_code: "W", league_label: "7th", category: "Mens", position: 4 }),
    ];
    const standings = computeLeagueStandings(rows, sizes);
    const marius: LeagueStanding | undefined = standings.get("M");
    const willem: LeagueStanding | undefined = standings.get("W");
    expect(marius).toMatchObject({ division: 6, avgPosition: 3.1, rubbers: 10 });
    expect(willem).toMatchObject({ division: 7, avgPosition: 4, rubbers: 5 });
    if (!marius || !willem) throw new Error("Expected both regional league standings");
    expect(leaguePositionLabel(marius)).toBe("6th League · avg 3.1 (10 games) · index 23.1 · Mens");
    expect(leaguePositionLabel(willem)).toBe("7th League · avg 4.0 (5 games) · index 28.0 · Mens");
    expect(leagueAverageHandicap(marius?.index, willem?.index)).toEqual({ handicap_a: -5, handicap_b: 0 });
  });

  it("orders 6th League before 7th League and within each by actual average, never host ladder", () => {
    const rows = [
      ...Array(10).fill({ player_code: "six-three", league_label: "6th", category: "Mens", position: 3 }),
      ...Array(10).fill({ player_code: "six-two", league_label: "6th", category: "Mens", position: 2 }),
      ...Array(10).fill({ player_code: "seven-one", league_label: "7th", category: "Mens", position: 1 }),
    ];
    const standings = computeLeagueStandings(rows, sizes);
    const players = [
      { id: "seven-one", ladder_position: 1 },
      { id: "missing", ladder_position: 2 },
      { id: "six-three", ladder_position: 3 },
      { id: "six-two", ladder_position: 80 },
    ];
    const rankOf = (p: { id: string }) => standings.get(p.id)?.index ?? null;
    expect(sortDivisionEntrants(players, { rankOf }).map((p) => p.id))
      .toEqual(["six-two", "six-three", "seven-one", "missing"]);
    expect(sortDivisionEntrants(players, { rankOf, manual: true, manualOrder: ["seven-one", "six-two"] }).map((p) => p.id))
      .toEqual(["seven-one", "six-two", "six-three", "missing"]);
  });
});
