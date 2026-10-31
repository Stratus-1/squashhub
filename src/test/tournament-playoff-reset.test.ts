import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyPlayoffSettings, effectiveTournamentSettings } from "@/lib/tournaments/effective-settings";

// Exercise the actual reset callback without mounting the entire admin workspace.
const source = readFileSync("src/components/club-admin/ClubChampsTab.tsx", "utf8");
const body = source.match(/const resetWizard = \(\) => \{([\s\S]*?)\n  \};/)?.[1];

describe("new tournament playoff reset", () => {
  it.each(["bo3", "bo5", "all3", "all5"])("clears edited %s overrides so new playoffs inherit pool scoring", (format) => {
    if (!body) throw new Error("Tournament reset callback not found");
    const state: Record<string, unknown> = {
      setLeaguePlayoffMatchFormats: { "1": format, "2": "all5" },
      setLeaguePlayoffPointsPerGame: { "1": 15 },
    };
    const setters = [...new Set(body.match(/\bset\w+(?=\()/g) ?? [])];
    const reset = new Function(...setters, "scope", "DEFAULT_CHAMPION_SCOPE", "newDiamondDraft", body);
    reset(...setters.map((key) => (value: unknown) => { state[key] = value; }), "club", "per_league", () => ({}));

    expect(state.setLeaguePlayoffMatchFormats).toEqual({});
    expect(state.setLeaguePlayoffPointsPerGame).toEqual({});
    const tournament = {
      scoring_mode: "standard", points_per_game: 7, best_of: 3, play_all_games: false,
      league_playoff_match_formats: state.setLeaguePlayoffMatchFormats,
      league_playoff_points_per_game: state.setLeaguePlayoffPointsPerGame,
    };
    for (const group of [1, 2]) {
      expect(applyPlayoffSettings(effectiveTournamentSettings(tournament, group), tournament, group))
        .toMatchObject({ pointsPerGame: 7, bestOf: 3, playAllGames: false });
    }
  });
});