/**
 * Knockout progression — configured rounds, alive vs eliminated.
 *
 * Two things used to be implicit and both caused bugs:
 *
 *  1. The next round was inferred from how many matches happened to be left in
 *     the latest round ("2 matches left ⇒ call it a semi-final"). Now the
 *     organiser declares the sequence up front (`club_champs_rounds`) and the
 *     UI only ever offers the CONFIGURED next stage.
 *  2. Nothing tracked who was still alive, so a knocked-out player kept showing
 *     as an ordinary entrant in the standings. Elimination is DERIVED here from
 *     the match rows — never stored, never mutating the original entry/section
 *     assignment, so tournament history stays intact.
 *
 * Pure logic only: no network, no React.
 */
import type { KnockoutMatchLike } from "./knockout";
import { winnerOf } from "./knockout";

export type RoundType = "knockout" | "semi_final" | "final" | "third_place";

/** One configured stage of one section's draw (a `club_champs_rounds` row). */
export type ChampRound = {
  id?: string;
  champ_id?: string;
  group_number: number;
  section_number: number;
  round_number: number;
  round_type: RoundType;
  label?: string | null;
  play_by?: string | null;
  notes?: string | null;
  scheduling_mode?: "self" | "club" | null;
  status?: "pending" | "active" | "complete" | null;
};

const DONE = new Set(["completed", "complete", "walkover", "forfeit"]);

/** Has this match produced a decision we can progress from? */
export function isResolved(m: KnockoutMatchLike): boolean {
  if (m.is_bye) return true;
  if (!DONE.has(String(m.status || "").toLowerCase())) return false;
  return !!winnerOf(m);
}

/** Human name for a round with `playersInRound` competitors starting it. */
export function labelForPlayers(playersInRound: number): string {
  switch (playersInRound) {
    case 2:
      return "Final";
    case 4:
      return "Semi-final";
    case 8:
      return "Quarter-final";
    default:
      return `Round of ${playersInRound}`;
  }
}

export function typeForPlayers(playersInRound: number): RoundType {
  if (playersInRound <= 2) return "final";
  if (playersInRound === 4) return "semi_final";
  return "knockout";
}

/**
 * The default round plan for a section of `entrants` players: one row per
 * round, ending semi-final → final. Organisers may retitle/redate rows but the
 * COUNT is fixed by the bracket, which is what `validateRoundPlan` enforces.
 */
export function suggestRoundPlan(
  entrants: number,
  opts: { groupNumber?: number; sectionNumber?: number; schedulingMode?: "self" | "club" } = {},
): ChampRound[] {
  if (!Number.isFinite(entrants) || entrants < 2) return [];
  let size = 2;
  while (size < entrants) size *= 2;
  const depth = Math.log2(size);
  return Array.from({ length: depth }, (_, i) => {
    const players = size / Math.pow(2, i);
    return {
      group_number: opts.groupNumber ?? 1,
      section_number: opts.sectionNumber ?? 1,
      round_number: i + 1,
      round_type: typeForPlayers(players),
      label: labelForPlayers(players),
      play_by: null,
      scheduling_mode: opts.schedulingMode ?? "self",
      status: "pending" as const,
    };
  });
}

/** How many rounds a section of `entrants` needs. */
export function requiredRoundCount(entrants: number): number {
  if (!Number.isFinite(entrants) || entrants < 2) return 0;
  return Math.ceil(Math.log2(entrants));
}

/** Organiser-facing validation of a hand-edited plan. Returns problems, [] = ok. */
export function validateRoundPlan(plan: ChampRound[], entrants: number): string[] {
  const problems: string[] = [];
  const need = requiredRoundCount(entrants);
  if (plan.length !== need) {
    problems.push(
      `${entrants} entrants need exactly ${need} round${need === 1 ? "" : "s"} — this plan has ${plan.length}.`,
    );
  }
  const numbers = plan.map((r) => r.round_number);
  if (new Set(numbers).size !== numbers.length) problems.push("Round numbers must be unique.");
  for (let i = 0; i < plan.length; i++) {
    if (plan[i].round_number !== i + 1) {
      problems.push("Rounds must be numbered consecutively from 1.");
      break;
    }
  }
  if (plan.length > 0 && plan[plan.length - 1].round_type !== "final") {
    problems.push("The last round must be the final.");
  }
  if (plan.length > 1 && plan[plan.length - 2].round_type !== "semi_final") {
    problems.push("The second-to-last round must be the semi-final.");
  }
  return problems;
}

export type EntrantState = {
  memberId: string;
  /** Round they are alive in (the round they still have to play), or null once out. */
  aliveInRound: number | null;
  /** Round they lost in, or null while still alive. */
  eliminatedInRound: number | null;
  eliminated: boolean;
};

export type SectionProgression = {
  groupNumber: number;
  section: number;
  /** Configured plan for this section (empty when none is stored yet). */
  plan: ChampRound[];
  /** Highest round with match rows (0 = not started). */
  currentRound: number;
  currentRoundMatches: KnockoutMatchLike[];
  completed: number;
  total: number;
  /** Every match of the current round is resolved. */
  currentRoundComplete: boolean;
  /** Matches still blocking progression. */
  unresolved: KnockoutMatchLike[];
  /** The configured round after the current one, if any. */
  nextRound: ChampRound | null;
  /** The next round already has match rows. */
  nextRoundGenerated: boolean;
  /** Safe to generate the next round right now. */
  canGenerateNext: boolean;
  /** Why not, when `canGenerateNext` is false. */
  blockedReason: string | null;
  /** Section decided (final played out). */
  complete: boolean;
  winner: string | null;
  /** Every entrant that ever appeared in this section, with their state. */
  entrants: EntrantState[];
};

function sidesOf(m: KnockoutMatchLike): string[] {
  return [m.player_a_member_id, m.player_b_member_id].filter(Boolean) as string[];
}

/**
 * Derive alive/eliminated state for one section from its match rows.
 * A bye never eliminates anyone. Unfinished matches leave both sides alive.
 */
export function entrantStates(sectionMatches: KnockoutMatchLike[]): EntrantState[] {
  const state = new Map<string, EntrantState>();
  const ordered = [...sectionMatches].sort(
    (a, b) => (Number(a.round_number) || 0) - (Number(b.round_number) || 0),
  );
  for (const m of ordered) {
    const round = Number(m.round_number) || 0;
    for (const id of sidesOf(m)) {
      const prev = state.get(id);
      if (!prev) {
        state.set(id, { memberId: id, aliveInRound: round, eliminatedInRound: null, eliminated: false });
      } else if (!prev.eliminated) {
        prev.aliveInRound = round;
      }
    }
    if (m.is_bye) continue;
    if (!isResolved(m)) continue;
    const w = winnerOf(m);
    if (!w) continue;
    for (const id of sidesOf(m)) {
      if (id === w) continue;
      const row = state.get(id)!;
      row.eliminated = true;
      row.eliminatedInRound = round;
      row.aliveInRound = null;
    }
  }
  return Array.from(state.values());
}

/**
 * Full progression report per (division, section), combining the stored plan
 * with the actual match rows.
 */
export function sectionProgression(
  matches: KnockoutMatchLike[],
  rounds: ChampRound[] = [],
): SectionProgression[] {
  const ko = matches.filter((m) => (m.stage || "") === "ko");
  const keys = new Map<string, KnockoutMatchLike[]>();
  const keyOf = (g: unknown, s: unknown) => `${Number(g ?? 0)}|${Number(s ?? 1)}`;
  for (const m of ko) {
    const key = keyOf(m.group_number, m.section_number);
    if (!keys.has(key)) keys.set(key, []);
    keys.get(key)!.push(m);
  }
  // Sections that are configured but have no matches yet still deserve a row.
  for (const r of rounds) {
    const key = keyOf(r.group_number, r.section_number);
    if (!keys.has(key)) keys.set(key, []);
  }

  const out: SectionProgression[] = [];
  for (const [key, rows] of keys) {
    const [groupNumber, section] = key.split("|").map(Number);
    const plan = rounds
      .filter((r) => Number(r.group_number) === groupNumber && Number(r.section_number) === section)
      .sort((a, b) => a.round_number - b.round_number);

    const currentRound = rows.reduce((max, m) => Math.max(max, Number(m.round_number) || 0), 0);
    const currentRoundMatches = rows
      .filter((m) => (Number(m.round_number) || 0) === currentRound)
      .sort((a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0));
    const unresolved = currentRoundMatches.filter((m) => !isResolved(m));
    const currentRoundComplete = currentRoundMatches.length > 0 && unresolved.length === 0;

    const nextRoundNumber = currentRound + 1;
    const planned = plan.find((r) => r.round_number === nextRoundNumber) || null;
    // No stored plan? Fall back to bracket maths so legacy tournaments still work.
    const derivedNext: ChampRound | null =
      planned ||
      (currentRoundMatches.length > 1
        ? {
            group_number: groupNumber,
            section_number: section,
            round_number: nextRoundNumber,
            round_type: typeForPlayers(currentRoundMatches.length),
            label: labelForPlayers(currentRoundMatches.length),
            play_by: null,
            status: "pending" as const,
          }
        : null);

    const nextRoundGenerated = rows.some((m) => (Number(m.round_number) || 0) === nextRoundNumber);
    const complete = currentRoundComplete && currentRoundMatches.length === 1;
    const winner = complete ? winnerOf(currentRoundMatches[0]) : null;

    let blockedReason: string | null = null;
    if (currentRound === 0) blockedReason = "The draw has not been generated yet.";
    else if (complete) blockedReason = "This section is decided.";
    else if (nextRoundGenerated) blockedReason = `${derivedNext?.label || "The next round"} already exists.`;
    else if (!derivedNext) blockedReason = "No further round is configured.";
    else if (!currentRoundComplete)
      blockedReason = `${unresolved.length} match${unresolved.length === 1 ? "" : "es"} still to be played in this round.`;

    out.push({
      groupNumber,
      section,
      plan,
      currentRound,
      currentRoundMatches,
      completed: currentRoundMatches.length - unresolved.length,
      total: currentRoundMatches.length,
      currentRoundComplete,
      unresolved,
      nextRound: derivedNext,
      nextRoundGenerated,
      canGenerateNext: blockedReason === null,
      blockedReason,
      complete,
      winner,
      entrants: entrantStates(rows),
    });
  }
  return out.sort((a, b) => a.groupNumber - b.groupNumber || a.section - b.section);
}

/** Members who may appear in the NEXT round — winners of the current round only. */
export function advancingMembers(section: SectionProgression): string[] {
  if (!section.currentRoundComplete) return [];
  return section.currentRoundMatches.map((m) => winnerOf(m)).filter(Boolean) as string[];
}

/** Action label for the organiser's single context-aware button. */
export function generateActionLabel(section: SectionProgression): string {
  const label = section.nextRound?.label || labelForPlayers(Math.max(2, section.currentRoundMatches.length));
  if (/^final$/i.test(label)) return "Generate Final";
  if (/^semi/i.test(label)) return "Generate Semi-finals";
  return `Generate ${label}`;
}

/** Status line: "Semi-final · 2/4 complete · Next: Final". */
export function progressSummary(section: SectionProgression): string {
  const current =
    section.plan.find((r) => r.round_number === section.currentRound)?.label ||
    labelForPlayers(Math.max(2, section.currentRoundMatches.length * 2));
  const parts = [`${current} · ${section.completed}/${section.total} complete`];
  if (section.complete) parts.push("Section decided");
  else if (section.nextRound?.label) parts.push(`Next: ${section.nextRound.label}`);
  return parts.join(" · ");
}
