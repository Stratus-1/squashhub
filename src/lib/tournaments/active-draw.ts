/**
 * Active draw state — who is still in, pool by pool.
 *
 * Two rules drive everything here:
 *
 *  1. Elimination is scoped to a tournament DIVISION (group_number). A player
 *     knocked out of the A division must stay fully active in any other
 *     division they entered, so every helper takes the division's match rows
 *     only and never looks at a member globally.
 *  2. Progression is decided by how many entrants are STILL ACTIVE, never by
 *     how many match rows happen to exist. 2 active ⇒ final, 3–4 ⇒ semi-final,
 *     5–8 ⇒ quarter-final, otherwise a "Round of N" with byes.
 *
 * Nothing is stored: state is derived from the match rows, so results and
 * history are never mutated or deleted.
 */
import type { KnockoutMatchLike } from "./knockout";
import { winnerOf } from "./knockout";

const DONE = new Set(["completed", "complete", "walkover", "forfeit"]);

/** Has this match produced a decision we can progress from? */
export function isResolved(m: KnockoutMatchLike): boolean {
  if (m.is_bye) return true;
  if (!DONE.has(String(m.status || "").toLowerCase())) return false;
  return !!winnerOf(m);
}

/** Bracket size (next power of two) for `n` active entrants. */
export function bracketSizeForActive(n: number): number {
  let p = 2;
  while (p < n) p *= 2;
  return Math.max(2, p);
}

/** Rounds still to play with `n` entrants alive (1 = the final). */
export function roundsRemaining(n: number): number {
  if (!Number.isFinite(n) || n < 2) return 0;
  return Math.ceil(Math.log2(n));
}

/**
 * Stage name derived from ACTIVE entrants, not match count.
 * 2 → Final, 3–4 → Semi-final, 5–8 → Quarter-final, else Round of <bracket>.
 */
export function labelForActive(activeEntrants: number): string {
  const remaining = roundsRemaining(activeEntrants);
  if (remaining <= 0) return "Final";
  if (remaining === 1) return "Final";
  if (remaining === 2) return "Semi-final";
  if (remaining === 3) return "Quarter-final";
  return `Round of ${bracketSizeForActive(activeEntrants)}`;
}

export function typeForActive(activeEntrants: number): "final" | "semi_final" | "knockout" {
  const remaining = roundsRemaining(activeEntrants);
  if (remaining <= 1) return "final";
  if (remaining === 2) return "semi_final";
  return "knockout";
}

/** Byes needed when `n` active entrants start a round. */
export function byesForActive(n: number): number {
  if (n < 2) return 0;
  return bracketSizeForActive(n) - n;
}

const KNOCKOUT_STAGES = new Set(["ko", "playoff_sf", "playoff_final"]);

function isKoRow(m: KnockoutMatchLike): boolean {
  return KNOCKOUT_STAGES.has(String((m as any).stage || ""));
}

function sidesOf(m: KnockoutMatchLike): string[] {
  return [
    m.player_a_member_id,
    m.partner_a_member_id,
    m.player_b_member_id,
    m.partner_b_member_id,
  ].filter(Boolean) as string[];
}

function losingSideIds(m: KnockoutMatchLike): string[] {
  const w = winnerOf(m);
  if (!w) return [];
  const aSide = [m.player_a_member_id, m.partner_a_member_id].filter(Boolean) as string[];
  const bSide = [m.player_b_member_id, m.partner_b_member_id].filter(Boolean) as string[];
  if (aSide.includes(w)) return bSide;
  if (bSide.includes(w)) return aSide;
  return [];
}

export type EliminationInfo = { round: number; section: number };

/**
 * Members eliminated inside ONE division, with the round they went out in.
 * Byes never eliminate anyone; unresolved matches leave both sides active.
 */
export function divisionEliminations(
  matches: KnockoutMatchLike[],
  groupNumber: number,
): Map<string, EliminationInfo> {
  const out = new Map<string, EliminationInfo>();
  const rows = matches
    .filter((m) => isKoRow(m) && Number(m.group_number) === Number(groupNumber))
    .sort((a, b) => (Number(a.round_number) || 0) - (Number(b.round_number) || 0));
  for (const m of rows) {
    if (m.is_bye) continue;
    if (!isResolved(m)) continue;
    const round = Number(m.round_number) || 0;
    const section = Number(m.section_number ?? 1);
    for (const id of losingSideIds(m)) {
      if (!out.has(id)) out.set(id, { round, section });
    }
  }
  return out;
}

/** Convenience: is this member out of THIS division? */
export function isEliminatedInDivision(
  matches: KnockoutMatchLike[],
  groupNumber: number,
  memberId: string,
): boolean {
  return divisionEliminations(matches, groupNumber).has(memberId);
}

export type PoolState = {
  /** section_number; 0 = the division's finals bracket. */
  section: number;
  /** "A", "B" … ("Finals" is rendered by the caller for section 0). */
  letter: string;
  /** Everyone who ever appeared in this pool. */
  entrantIds: string[];
  /** Still in the draw. */
  activeIds: string[];
  /** Out, with the round they lost in. */
  eliminated: { memberId: string; round: number }[];
  /** Every match of the pool is resolved. */
  complete: boolean;
  /** Pool decided down to its winner(s) — the ones who go through. */
  qualifierIds: string[];
  latestRound: number;
  matchesTotal: number;
  matchesDone: number;
};

/** Per-pool (section) state inside one division. */
export function divisionPools(
  matches: KnockoutMatchLike[],
  groupNumber: number,
): PoolState[] {
  const rows = matches.filter(
    (m) => isKoRow(m) && Number(m.group_number) === Number(groupNumber),
  );
  const bySection = new Map<number, KnockoutMatchLike[]>();
  for (const m of rows) {
    const s = Number(m.section_number ?? 1);
    if (!bySection.has(s)) bySection.set(s, []);
    bySection.get(s)!.push(m);
  }

  const out: PoolState[] = [];
  for (const [section, sectionRows] of bySection) {
    const entrantIds: string[] = [];
    for (const m of sectionRows) {
      for (const id of sidesOf(m)) if (!entrantIds.includes(id)) entrantIds.push(id);
    }
    const elimMap = new Map<string, number>();
    for (const m of sectionRows) {
      if (m.is_bye || !isResolved(m)) continue;
      const round = Number(m.round_number) || 0;
      for (const id of losingSideIds(m)) if (!elimMap.has(id)) elimMap.set(id, round);
    }
    const activeIds = entrantIds.filter((id) => !elimMap.has(id));
    const latestRound = sectionRows.reduce(
      (max, m) => Math.max(max, Number(m.round_number) || 0),
      0,
    );
    const playable = sectionRows.filter((m) => !m.is_bye);
    const matchesDone = playable.filter((m) => isResolved(m)).length;
    const complete = sectionRows.length > 0 && sectionRows.every((m) => isResolved(m));
    out.push({
      section,
      letter: String.fromCharCode(64 + Math.max(1, section)),
      entrantIds,
      activeIds,
      eliminated: Array.from(elimMap.entries()).map(([memberId, round]) => ({ memberId, round })),
      complete,
      qualifierIds: complete ? activeIds : [],
      latestRound,
      matchesTotal: playable.length,
      matchesDone,
    });
  }
  return out.sort((a, b) => a.section - b.section);
}
