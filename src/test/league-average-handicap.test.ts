import { describe, expect, it } from "vitest";
import {
  computeLeagueStandings,
  leagueAverageHandicap,
  leagueSizes,
} from "@/lib/tournament-formats/league-average-handicap";

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
});
