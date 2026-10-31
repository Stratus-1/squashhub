import { gameSetsOf } from "./tie-breaks";
import { validateQuickResult, type GameScore } from "./quick-result";
import type { EffectiveTournamentSettings } from "./effective-settings";

export function savedCorrectionGames(match: { game_scores?: unknown; score?: string | null }): GameScore[] {
  let value = match.game_scores;
  try { if (typeof value === "string") value = JSON.parse(value); } catch { value = null; }
  const parsed = gameSetsOf({ game_scores: value, score: match.score });
  return parsed.pointsKnown ? parsed.sets ?? [] : [];
}

export function validateCorrectionGames(games: GameScore[], rules: EffectiveTournamentSettings): string | null {
  if (!["standard", "swiss"].includes(rules.scoringMode)) return "This scoring format needs manual review before a correction.";
  for (const [i, game] of games.entries()) {
    if (![game.a, game.b].every(n => Number.isInteger(n) && n >= 0) || game.a === game.b) return `Game ${i + 1}: enter unequal whole-number scores.`;
    const high = Math.max(game.a, game.b);
    if (high < rules.pointsPerGame || (high > rules.pointsPerGame && Math.abs(game.a - game.b) !== 2)) return `Game ${i + 1}: reach PAR ${rules.pointsPerGame}; extended games need a two-point lead.`;
  }
  if (rules.playAllGames) return games.length === rules.bestOf ? null : `Enter all ${rules.bestOf} games.`;
  const result = validateQuickResult(games, rules.bestOf);
  return result.valid ? null : result.error ?? "Check the game scores.";
}