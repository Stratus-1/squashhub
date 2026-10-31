import { expect, it } from "vitest";
import { savedCorrectionGames, validateCorrectionGames } from "@/lib/tournaments/result-correction";
import { effectiveTournamentSettings, applyPlayoffSettings } from "@/lib/tournaments/effective-settings";

const games = [{ a: 7, b: 5 }, { a: 5, b: 7 }, { a: 7, b: 5 }];
it("hydrates the recorded three game scores rather than replacing them", () => {
  expect(savedCorrectionGames({ game_scores: JSON.stringify({ sets: games }) })).toEqual(games);
});
it("accepts PAR 7 best of three from the category over PAR 11 best of five defaults", () => {
  const rules = effectiveTournamentSettings({ points_per_game: 11, best_of: 5, league_points_per_game: { 1: 7 }, league_best_of: { 1: 3 } }, 1);
  expect(rules.pointsPerGame).toBe(7); expect(rules.bestOf).toBe(3);
  expect(validateCorrectionGames(games, rules)).toBeNull();
});
it("uses independent playoff PAR and match length overrides", () => {
  const t = { league_playoff_points_per_game: { 1: 7 }, league_playoff_match_formats: { 1: "bo3" } };
  expect(validateCorrectionGames(games, applyPlayoffSettings(effectiveTournamentSettings(t, 1), t, 1))).toBeNull();
});
it("rejects incomplete and tied games", () => {
  const rules = effectiveTournamentSettings({ points_per_game: 7, best_of: 3 }, 1);
  expect(validateCorrectionGames([{ a: 7, b: 7 }], rules)).not.toBeNull();
  expect(validateCorrectionGames([{ a: 7, b: 5 }], rules)).not.toBeNull();
});