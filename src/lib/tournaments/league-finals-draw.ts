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

/** The play-off bracket itself (section 0), once it has been started. */
export function finalsSection(sections: SectionProgression[]): SectionProgression | null {
  return sections.find((s) => s.section === LEAGUE_FINALS_SECTION) ?? null;
}

/** Everyone knocked out in the play-off bracket already. */
function finalsEliminated(sections: SectionProgression[]): Set<string> {
  const f = finalsSection(sections);
  return new Set((f?.entrants || []).filter((e) => e.eliminated).map((e) => String(e.memberId)));
}

/**
 * Who is still standing in this league, pools AND play-off together.
 *
 * Once the play-off has started, a pool winner who lost a play-off match is
 * out — their pool row is history. Survivors are therefore the players still
 * alive in the play-off, plus any pool winner who has not been drawn into it
 * yet (e.g. a pool that finished later).
 */
export function leagueSurvivors(sections: SectionProgression[]): string[] {
  const pools = finalsPools(sections);
  const out = finalsEliminated(sections);
  const f = finalsSection(sections);
  const inFinals = new Set((f?.entrants || []).map((e) => String(e.memberId)));
  const ids: string[] = [];
  for (const e of f?.entrants || []) {
    if (!e.eliminated) ids.push(String(e.memberId));
  }
  for (const p of pools) {
    // A decided pool with no entrant detail still has its winner standing.
    const list =
      p.entrants.length > 0
        ? p.entrants
        : p.complete && p.winner
          ? [{ memberId: p.winner, eliminated: false } as any]
          : [];
    for (const e of list) {
      const id = String(e.memberId);
      if (e.eliminated || out.has(id) || inFinals.has(id) || ids.includes(id)) continue;
      ids.push(id);
    }
  }
  return ids;
}

/** Total players still standing across one league. */
export function leagueSurvivorCount(sections: SectionProgression[]): number {
  return leagueSurvivors(sections).length;
}

/**
 * Ready when every pool is decided, OR the field is down to a bracket-sized
 * number (2 / 4 / 8) — two decided pools plus a pool with two players left is
 * a semi-final, not a wait. Once the play-off has started the same rule keeps
 * applying, so two survivors of the semi-finals can be drawn into the final.
 */
export function finalsReady(sections: SectionProgression[]): boolean {
  const pools = finalsPools(sections);
  if (pools.length < 2) return false;
  const f = finalsSection(sections);
  const survivors = leagueSurvivorCount(sections);
  if (survivors < 2) return false;
  // A play-off round still being played is not a new draw.
  if (f && !f.currentRoundComplete) return false;
  if (f && f.nextRoundGenerated) return false;
  if (pools.every((p) => p.complete && !!p.winner)) return true;
  return leaguePlayoffReady(false, survivors);
}


/** Round number the finals sit at: one after the deepest round in the league. */
export function finalsRoundNumber(sections: SectionProgression[]): number {
  const rounds = [...finalsPools(sections), ...(finalsSection(sections) ? [finalsSection(sections)!] : [])].map(
    (p) => p.currentRound,
  );
  if (rounds.length === 0) return 1;
  return Math.max(...rounds) + 1;
}

/**
 * Board entrants = the winner of each pool, seeded by pool order (A, B, C…).
 * Doubles partners travel with the winner, taken from the fixture they won.
 */
export function leagueFinalsEntrants(
  sections: SectionProgression[],
  nameOf: (id: string) => string = () => "Player",
): DrawEntrant[] {
  const pools = finalsPools(sections);
  const allDecided = pools.length >= 2 && pools.every((p) => p.complete && !!p.winner);
  const partnerOf = (p: SectionProgression, id: string): string | null => {
    for (const m of p.currentRoundMatches as any[]) {
      if (m?.player_a_member_id === id) return m?.partner_a_member_id ?? null;
      if (m?.player_b_member_id === id) return m?.partner_b_member_id ?? null;
    }
    return null;
  };
  // Anyone already knocked out of the play-off never returns to the board.
  const survivors = new Set(leagueSurvivors(sections));
  const fin = finalsSection(sections);
  const out: DrawEntrant[] = [];
  const pushed = new Set<string>();
  const add = (id: string, from: SectionProgression, label: string) => {
    if (!id || pushed.has(id) || !survivors.has(id)) return;
    pushed.add(id);
    out.push({ id, name: nameOf(id), partnerId: partnerOf(from, id), seed: out.length + 1, rankLabel: label });
  };
  for (const p of pools) {
    // Decided pool → its winner. Pool still running → everyone still in it.
    const ids = allDecided
      ? p.complete && p.winner
        ? [p.winner]
        : []
      : p.complete && p.winner
        ? [p.winner]
        : p.entrants.filter((e) => !e.eliminated).map((e) => e.memberId);
    for (const id of ids) {
      add(
        String(id),
        p,
        p.complete && p.winner === id ? `Pool ${sectionLetter(p.section)} winner` : `Pool ${sectionLetter(p.section)}`,
      );
    }
  }
  // Players who already won a play-off round belong on the next board even
  // though their pool row is now history.
  if (fin) {
    for (const e of fin.entrants) add(String(e.memberId), fin, "Play-off winner");
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
