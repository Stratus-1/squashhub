/**
 * Monrad (positional draw) planning maths — display/planning only, never generates fixtures.
 * Every entrant plays every round: winners and losers each continue into their own positional
 * bracket, so after log2(bracket) rounds every place 1..n is decided.
 * Non-power-of-two fields are padded to the next power of two; byes go to the top seeds in
 * round 1 and a bye-holder never meets another bye in the same bracket, so no entrant gets a
 * second bye before everyone has had a match.
 */
export interface MonradPlan { entrants: number; bracket: number; byes: number; rounds: number; matches: number; matchesPerRound: number[] }

export function monradPlan(n: number): MonradPlan | null {
  if (!Number.isFinite(n) || n < 2) return null;
  const rounds = Math.ceil(Math.log2(n));
  const bracket = 2 ** rounds;
  const byes = bracket - n;
  // Round 1: byes pair with real entrants, remaining real entrants play each other.
  const r1 = Math.floor((n - byes) / 2);
  // Later rounds: every real entrant is in a positional sub-bracket; "ghost" slots (byes) sink to
  // the bottom brackets, so real-vs-real matches are floor(real/2) per bracket half. Upper bound
  // with byes is floor(n/2); exact for power-of-two fields.
  const later = Array.from({ length: rounds - 1 }, () => Math.floor(n / 2));
  const matchesPerRound = [r1, ...later];
  return { entrants: n, bracket, byes, rounds, matches: matchesPerRound.reduce((s, x) => s + x, 0), matchesPerRound };
}

export function monradNote(n: number): string | null {
  const p = monradPlan(n);
  if (!p) return null;
  return p.byes ? `${p.rounds} rounds · ${p.bracket}-draw with ${p.byes} bye${p.byes === 1 ? "" : "s"} (top seeds) · ≈${p.matches} matches` : `${p.rounds} rounds · full ${p.bracket}-draw · ${p.matches} matches · all ${n} places decided`;
}
