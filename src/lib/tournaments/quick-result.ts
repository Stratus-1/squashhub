/**
 * Quick result capture for tournament matches that were PLAYED WITHOUT the
 * live marker (typical for self-scheduled knockout matches: the two players
 * arrange their own court and just report the score afterwards).
 *
 * This module holds ONLY pure logic. The dialog that uses it saves through the
 * exact same authoritative pipeline as the live marker
 * (`save_marker_match_result`), so winner, completion, stats and knockout
 * progression all behave identically. There is no parallel result system.
 */

import { canMarkChampMatch, type MarkPermission, type SelfScheduleMatchLike } from "./self-schedule";

export type Side = "a" | "b";

export interface GameScore {
  a: number;
  b: number;
}

/** Games one side must win to take the match. */
export function gamesToWin(bestOf: number): number {
  const bo = Number.isFinite(bestOf) && bestOf > 0 ? Math.floor(bestOf) : 5;
  return Math.floor(bo / 2) + 1;
}

/**
 * Every legal games tally for a best-of-N match, strongest result first
 * (e.g. best of 5 → 3-0, 3-1, 3-2). Used to build the quick-pick buttons.
 */
export function possibleGameTallies(bestOf: number): Array<{ won: number; lost: number }> {
  const need = gamesToWin(bestOf);
  const out: Array<{ won: number; lost: number }> = [];
  for (let lost = 0; lost < need; lost++) out.push({ won: need, lost });
  return out;
}

/**
 * Default per-game scores for a tally, from the winner's perspective:
 * the dropped games are listed first, then the games the winner took, so the
 * sequence is always a legal, decisive match.
 */
export function defaultGameScores(
  winner: Side,
  won: number,
  lost: number,
  pointsTarget = 11,
): GameScore[] {
  // Dropped games come first so the winner's final game is genuinely the
  // decider — a match can never contain games played after it was won.
  const games: GameScore[] = [];
  for (let i = 0; i < lost; i++) {
    games.push(winner === "a" ? { a: 0, b: pointsTarget } : { a: pointsTarget, b: 0 });
  }
  for (let i = 0; i < won; i++) {
    games.push(winner === "a" ? { a: pointsTarget, b: 0 } : { a: 0, b: pointsTarget });
  }
  return games;
}

export interface QuickResultValidation {
  valid: boolean;
  error?: string;
  winner?: Side;
  gamesA: number;
  gamesB: number;
}

/** Validate a set of per-game scores against the match's best-of rule. */
export function validateQuickResult(games: GameScore[], bestOf: number): QuickResultValidation {
  const need = gamesToWin(bestOf);
  let gamesA = 0;
  let gamesB = 0;

  if (!games.length) return { valid: false, error: "Enter at least one game score", gamesA, gamesB };

  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    const a = Number(g.a);
    const b = Number(g.b);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
      return { valid: false, error: `Game ${i + 1}: scores must be whole numbers`, gamesA, gamesB };
    }
    if (a === b) {
      return { valid: false, error: `Game ${i + 1} cannot be a tie`, gamesA, gamesB };
    }
    if (a > b) gamesA++;
    else gamesB++;
  }

  if (gamesA < need && gamesB < need) {
    return { valid: false, error: `Nobody has won ${need} games yet`, gamesA, gamesB };
  }
  if (gamesA >= need && gamesB >= need) {
    return { valid: false, error: "Both players cannot win the match", gamesA, gamesB };
  }
  if (games.length > bestOf) {
    return { valid: false, error: `A best of ${bestOf} match cannot have ${games.length} games`, gamesA, gamesB };
  }
  // The match must stop the moment it is decided — no dead rubbers.
  let a = 0;
  let b = 0;
  let decidedAt = games.length;
  for (let i = 0; i < games.length; i++) {
    if (games[i].a > games[i].b) a++;
    else b++;
    if (a === need || b === need) { decidedAt = i + 1; break; }
  }
  if (games.length > decidedAt) {
    return { valid: false, error: "Remove games played after the match was already won", gamesA, gamesB };
  }

  return { valid: true, winner: gamesA > gamesB ? "a" : "b", gamesA, gamesB };
}

export interface QuickResultPayload {
  score: string;
  gameScores: string;
  winner: Side;
  gamesA: number;
  gamesB: number;
}

/**
 * Build the exact score fields the live marker sends to
 * `save_marker_match_result` so both entry paths store identical data.
 */
export function buildQuickResultPayload(games: GameScore[], bestOf: number): QuickResultPayload {
  const v = validateQuickResult(games, bestOf);
  if (!v.valid || !v.winner) throw new Error(v.error || "Invalid result");
  return {
    score: games.map((g) => `${g.a}-${g.b}`).join(", "),
    gameScores: JSON.stringify({ sets: games.map((g) => ({ a: g.a, b: g.b })) }),
    winner: v.winner,
    gamesA: v.gamesA,
    gamesB: v.gamesB,
  };
}

/**
 * Who may capture a completed score for a tournament match.
 *
 * Intentionally the SAME audience as the live marker — participants, plus
 * club/tournament officials when `canManage` is passed — so we never end up
 * with an admin-only result button. Unlike marking, result entry is never
 * blocked by a missing court booking: scheduling and result capture are
 * separate concerns.
 */
export function canEnterChampResult(
  m: SelfScheduleMatchLike,
  memberId?: string | null,
  opts: { canManage?: boolean; anyClubMember?: boolean } = {},
): MarkPermission {
  return canMarkChampMatch(m, memberId, {
    canManage: opts.canManage,
    anyClubMember: opts.anyClubMember,
    requireBooking: false,
  });
}
