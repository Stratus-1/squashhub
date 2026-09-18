/**
 * Cross-pool league finals — manual draw support.
 *
 * When a league ran several pools, the pool winners still have to meet. Until
 * now that bracket was generated automatically (Pool A v Pool B, third winner
 * gets the bye). This module exposes the same information as a DRAW BOARD so
 * the organiser can decide who plays who and who sits out, exactly like every
 * other round.
 *
 * Pure logic: no React, no network. Completed pool matches are only READ.
 */
import { leaguePlayoffReady, type SectionProgression } from "./knockout-progression";
import { sectionLetter } from "./knockout";
import { suggestNextRoundBoard, type DrawBoard, type DrawEntrant } from "./draw-board";

/** The league finals bracket always lives in section 0. */
export const LEAGUE_FINALS_SECTION = 0;

/** Pools of one league that are relevant to a cross-pool decider. */
export function finalsPools(sections: SectionProgression[]): SectionProgression[] {
  return sections.filter((s) => s.section > 0).sort((a, b) => a.section - b.section);
}

/** Total players still standing across the pools of one league. */
export function leagueSurvivorCount(sections: SectionProgression[]): number {
  return finalsPools(sections).reduce(
    (n, p) => n + p.entrants.filter((e) => !e.eliminated).length,
    0,
  );
}

/**
 * Ready when every pool is decided, OR the pools together are down to a
 * bracket-sized field (2 / 4 / 8) — two decided pools plus a pool with two
 * players left is a semi-final, not a wait.
 */
export function finalsReady(sections: SectionProgression[]): boolean {
  const pools = finalsPools(sections);
  if (pools.length < 2) return false;
  if (pools.every((p) => p.complete && !!p.winner)) return true;
  return leaguePlayoffReady(false, leagueSurvivorCount(sections));
}


/** Round number the finals sit at: one after the deepest pool round. */
export function finalsRoundNumber(sections: SectionProgression[]): number {
  const pools = finalsPools(sections);
  if (pools.length === 0) return 1;
  return Math.max(...pools.map((p) => p.currentRound)) + 1;
}

/**
 * Board entrants = the winner of each pool, seeded by pool order (A, B, C…).
 * Doubles partners travel with the winner, taken from the fixture they won.
 */
export function leagueFinalsEntrants(
  sections: SectionProgression[],
  nameOf: (id: string) => string = () => "Player",
): DrawEntrant[] {
  const out: DrawEntrant[] = [];
  for (const p of finalsPools(sections)) {
    const w = p.winner;
    if (!p.complete || !w) continue;
    const m = p.currentRoundMatches[0] as any;
    const partnerId =
      m?.player_a_member_id === w
        ? m?.partner_a_member_id ?? null
        : m?.player_b_member_id === w
          ? m?.partner_b_member_id ?? null
          : null;
    out.push({
      id: w,
      name: nameOf(w),
      partnerId,
      seed: out.length + 1,
      rankLabel: `Pool ${sectionLetter(p.section)} winner`,
    });
  }
  return out;
}

/**
 * Suggested finals pairing — the same default as the automatic generator
 * (first v second, a third winner gets the bye). The organiser may drag it
 * into any other shape before confirming.
 */
export function suggestLeagueFinalsBoard(opts: {
  groupNumber: number;
  round: number;
  winners: DrawEntrant[];
}): DrawBoard {
  return suggestNextRoundBoard({
    groupNumber: opts.groupNumber,
    section: LEAGUE_FINALS_SECTION,
    round: opts.round,
    winners: opts.winners,
  });
}
