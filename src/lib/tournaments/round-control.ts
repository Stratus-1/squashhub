/**
 * Live tournament control — the admin state machine.
 *
 * Once a tournament has started the organiser should never be sent back to the
 * setup wizard to advance it. Every surface (tournament admin page, standings,
 * knockout card, Dates & Courts) asks THIS module the same question:
 *
 *    "what is the state of this draw and what should the admin do next?"
 *
 * Pure logic, no React, no network. The states are derived from the match rows
 * plus the configured round plan, so nothing is stored and no history moves.
 */
import type { KnockoutMatchLike } from "./knockout";
import {
  generateActionLabel,
  sectionProgression,
  type ChampRound,
  type SectionProgression,
} from "./knockout-progression";
import { labelForActive } from "./active-draw";

/** The single next thing an admin can do with a draw. */
export type RoundAction = "generate" | "schedule" | "await_results" | "none";

export type SectionControl = {
  groupNumber: number;
  /** 0 = the division's finals bracket, 1..n = pools/sections. */
  section: number;
  /** Friendly name of the round currently being played. */
  stageLabel: string;
  /** Friendly name of the round that comes next, when there is one. */
  nextStageLabel: string | null;
  /** Entrants still alive in this section. */
  activeCount: number;
  completed: number;
  total: number;
  /** Matches of the live round with no court/date yet. */
  unscheduled: number;
  /** One-line, human, contextual status + next action. */
  headline: string;
  action: RoundAction;
  /** Button text for `action`, null when there is nothing to click. */
  actionLabel: string | null;
  canGenerate: boolean;
  blockedReason: string | null;
  decided: boolean;
  winner: string | null;
  progression: SectionProgression;
};

/** A match is "scheduled" once it has a date (court/time may follow). */
export function isScheduled(m: KnockoutMatchLike): boolean {
  const any = m as any;
  return !!(any.scheduled_date || any.court_id || any.booking_id);
}

function currentStageLabel(s: SectionProgression): string {
  const planned = s.plan.find((r) => r.round_number === s.currentRound)?.label;
  if (planned) return planned;
  const contestants = new Set<string>();
  for (const m of s.currentRoundMatches) {
    for (const id of [m.player_a_member_id, m.player_b_member_id]) if (id) contestants.add(id);
  }
  return labelForActive(Math.max(2, contestants.size));
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Derive the control state of one section from its progression report. */
export function sectionControl(
  s: SectionProgression,
  allMatches: KnockoutMatchLike[] = [],
  opts: { selfScheduled?: boolean } = {},
): SectionControl {
  const stageLabel = currentStageLabel(s);
  const nextStageLabel = s.nextRound?.label ?? null;
  const liveRound = s.currentRoundMatches.filter((m) => !m.is_bye);
  const unscheduled = liveRound.filter((m) => !isScheduled(m)).length;

  let action: RoundAction = "none";
  let actionLabel: string | null = null;
  let headline: string;

  if (s.currentRound === 0) {
    headline = "The draw has not been generated yet.";
  } else if (s.complete) {
    headline = `${stageLabel} complete — this draw is decided.`;
  } else if (s.canGenerateNext) {
    action = "generate";
    actionLabel = generateActionLabel(s);
    headline = `${stageLabel} complete — ${plural(s.activeCount, "player")} remain. Ready for ${
      nextStageLabel ?? "the next round"
    }.`;
  } else if (unscheduled > 0 && s.completed === 0) {
    action = opts.selfScheduled ? "await_results" : "schedule";
    actionLabel = opts.selfScheduled ? null : "Set dates & courts";
    headline = opts.selfScheduled
      ? `${stageLabel} generated — ${plural(unscheduled, "fixture")} unscheduled. Players may arrange these themselves.`
      : `${stageLabel} generated — ${plural(unscheduled, "fixture")} unscheduled. Set dates & courts.`;
  } else {
    action = "await_results";
    headline = `${stageLabel} in progress — ${s.completed} of ${s.total} results entered.`;
    if (unscheduled > 0) {
      actionLabel = opts.selfScheduled ? null : "Set dates & courts";
      if (!opts.selfScheduled) action = "schedule";
      headline += ` ${plural(unscheduled, "fixture")} still unscheduled.`;
    }
  }

  return {
    groupNumber: s.groupNumber,
    section: s.section,
    stageLabel,
    nextStageLabel,
    activeCount: s.activeCount,
    completed: s.completed,
    total: s.total,
    unscheduled,
    headline,
    action,
    actionLabel,
    canGenerate: s.canGenerateNext,
    blockedReason: s.blockedReason,
    decided: s.complete,
    winner: s.winner,
    progression: s,
  };
}

export type DivisionControl = {
  groupNumber: number;
  sections: SectionControl[];
  /** Section the admin should look at first (something to do beats nothing). */
  focus: SectionControl | null;
  /** Whole division decided. */
  decided: boolean;
};

const PRIORITY: Record<RoundAction, number> = {
  generate: 0,
  schedule: 1,
  await_results: 2,
  none: 3,
};

/**
 * Control state per division. Divisions are fully independent — a decided A
 * division never affects what the B division is asking for.
 */
export function divisionControls(
  matches: KnockoutMatchLike[],
  rounds: ChampRound[] = [],
  opts: { selfScheduled?: boolean } = {},
): DivisionControl[] {
  const states = sectionProgression(matches, rounds);
  const byGroup = new Map<number, SectionControl[]>();
  for (const s of states) {
    const c = sectionControl(s, matches, opts);
    if (!byGroup.has(c.groupNumber)) byGroup.set(c.groupNumber, []);
    byGroup.get(c.groupNumber)!.push(c);
  }
  return Array.from(byGroup.entries())
    .map(([groupNumber, sections]) => {
      const sorted = [...sections].sort((a, b) => a.section - b.section);
      const focus =
        [...sorted].sort(
          (a, b) => PRIORITY[a.action] - PRIORITY[b.action] || a.section - b.section,
        )[0] ?? null;
      return {
        groupNumber,
        sections: sorted,
        focus: focus ?? null,
        decided: sorted.length > 0 && sorted.every((s) => s.decided),
      };
    })
    .sort((a, b) => a.groupNumber - b.groupNumber);
}

/** Control state of one division, or null when it has no draw at all. */
export function divisionControl(
  matches: KnockoutMatchLike[],
  groupNumber: number,
  rounds: ChampRound[] = [],
  opts: { selfScheduled?: boolean } = {},
): DivisionControl | null {
  return (
    divisionControls(matches, rounds, opts).find((d) => d.groupNumber === Number(groupNumber)) ||
    null
  );
}

export type GroupStageControl = {
  groupNumber: number;
  played: number;
  total: number;
  complete: boolean;
  qualified: number;
  headline: string;
  action: RoundAction;
  actionLabel: string | null;
};

const DONE = new Set(["completed", "complete", "walkover", "forfeit"]);

/**
 * Pool/round-robin stage of a division, for the hand-off into the knockout.
 * Only meaningful before any knockout row exists for that division.
 */
export function groupStageControl(
  matches: KnockoutMatchLike[],
  groupNumber: number,
): GroupStageControl | null {
  const rows = (matches as any[]).filter(
    (m) => (m.stage || "group") === "group" && Number(m.group_number) === Number(groupNumber) && !m.is_bye,
  );
  if (rows.length === 0) return null;
  const played = rows.filter((m) => DONE.has(String(m.status || "").toLowerCase())).length;
  const complete = played === rows.length;
  const players = new Set<string>();
  for (const m of rows) {
    for (const id of [m.player_a_member_id, m.player_b_member_id]) if (id) players.add(id);
  }
  const hasKo = (matches as any[]).some(
    (m) => (m.stage || "") === "ko" && Number(m.group_number) === Number(groupNumber),
  );
  return {
    groupNumber,
    played,
    total: rows.length,
    complete,
    qualified: players.size,
    headline: hasKo
      ? `Pool stage ${complete ? "complete" : `${played} of ${rows.length} played`} — knockout under way.`
      : complete
        ? `Pool stage complete — ${plural(players.size, "player")} qualified. Ready to generate the knockout.`
        : `Pool stage in progress — ${played} of ${rows.length} results entered.`,
    action: !hasKo && complete ? "generate" : "await_results",
    actionLabel: !hasKo && complete ? "Generate knockout round" : null,
  };
}
