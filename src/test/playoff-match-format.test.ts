import { describe, it, expect } from "vitest";
import { applyPlayoffSettings, effectiveTournamentSettings } from "@/lib/tournaments/effective-settings";
import { inheritedScoringForGroup } from "@/lib/tournaments/stage-scoring";
import { divisionScoringColumns } from "@/lib/smart-builder/step-handover";

const pool = { scoring_mode: "standard", points_per_game: 7, best_of: 5, play_all_games: false };
describe("independent playoff match format", () => {
  it.each([
    ["bo3", 3, false], ["bo5", 5, false], ["all3", 3, true], ["all5", 5, true],
  ] as const)("%s keeps Par 7 and applies the selected game count", (format, games, all) => {
    const tournament = { ...pool, league_playoff_match_formats: { "1": format } };
    const base = effectiveTournamentSettings(tournament, 1);
    expect(applyPlayoffSettings(base, tournament, 1)).toMatchObject({ pointsPerGame: 7, bestOf: games, playAllGames: all });
    expect(base).toMatchObject({ pointsPerGame: 7, bestOf: 5, playAllGames: false });
    expect(inheritedScoringForGroup(tournament, 1, "Open")).toMatchObject({ ok: true, pointsPerGame: 7, bestOf: games, text: `PAR 7 · ${all ? "Play all" : "Best of"} ${games}` });
  });
  it("keeps another category and absent overrides on their pool rules", () => {
    const t = { ...pool, league_playoff_match_formats: { "1": "all3" } };
    const base = effectiveTournamentSettings(t, 2);
    expect(applyPlayoffSettings(base, t, 2)).toEqual(base);
  });
  it("preserves the independent playoff Par choice", () => {
    const t = { ...pool, league_playoff_points_per_game: { "1": 15 }, league_playoff_match_formats: { "1": "bo3" } };
    expect(applyPlayoffSettings(effectiveTournamentSettings(t, 1), t, 1)).toMatchObject({ pointsPerGame: 15, bestOf: 3, playAllGames: false });
  });
  it.each(["bo3", "bo5", "all3", "all5"] as const)("saves %s without changing pool match format", (format) => {
    const columns = divisionScoringColumns([{ scoring: { mode: "standard", pointsPerGame: 7, bestOf: 5, playAllGames: false, playoffMatchFormat: format } }]);
    expect(columns.league_playoff_match_formats).toEqual({ "1": format });
    expect(columns.league_best_of).toEqual({ "1": 5 });
    expect(columns.league_play_all_games).toEqual({ "1": false });
  });
});