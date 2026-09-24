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
  leaguePlayoffReady,
  leaguePlayoffStageLabel,
  type ChampRound,
  type SectionProgression,
} from "./knockout-progression";
import { finalsReady, leagueSurvivorCount } from "./league-finals-draw";


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
  /** Null for the synthetic "league final still to be created" row. */
  progression: SectionProgression | null;

};

/** A match is "scheduled" once it has a date (court/time may follow). */
export function isScheduled(m: KnockoutMatchLike): boolean {
  const any = m as any;
  return !!(any.scheduled_date || any.court_id || any.booking_id);
}

function currentStageLabel(s: SectionProgression): string {
  // Only the organiser names a round. Until they do it is "Round N".
  const planned = String(s.plan.find((r) => r.round_number === s.currentRound)?.label || "").trim();
  if (planned) return planned;
  return `Round ${Math.max(1, s.currentRound)}`;
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

/**
 * Where the ultimate winner of a knockout is decided.
 *  - "division": pool winners meet in a league final — ONE champion per league.
 *  - "pool":     every pool keeps its own winner, no cross-pool final.
 */
export type ChampionScope = "division" | "pool";

export const DEFAULT_CHAMPION_SCOPE: ChampionScope = "division";

/** Stage name for a cross-pool decider contested by `winners` pool winners. */
export function leagueFinalStageLabel(winners: number): string {
  if (winners <= 2) return "League final";
  if (winners <= 4) return "League semi-finals";
  return `League round of ${winners}`;
}

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
  opts: {
    selfScheduled?: boolean;
    championScope?: ChampionScope;
    /** Members pulled out by an organiser — out of the draw like a knockout. */
    withdrawnIds?: Iterable<string>;
  } = {},
): DivisionControl[] {
  const scope: ChampionScope = opts.championScope ?? DEFAULT_CHAMPION_SCOPE;
  const states = sectionProgression(matches, rounds, opts.withdrawnIds || []);
  const byGroup = new Map<number, SectionControl[]>();
  for (const s of states) {
    const c = sectionControl(s, matches, opts);
    if (!byGroup.has(c.groupNumber)) byGroup.set(c.groupNumber, []);
    byGroup.get(c.groupNumber)!.push(c);
  }
  return Array.from(byGroup.entries())
    .map(([groupNumber, sections]) => {
      let sorted = [...sections].sort((a, b) => a.section - b.section);
      const pools = sorted.filter((s) => s.section > 0);
      const hasFinalsBracket = sorted.some((s) => s.section === 0);

      // One champion per league: the players still standing have to meet. The
      // trigger is the league's TOTAL survivor count (2 / 4 / 8), so two
      // decided pools plus one pool with two players left = a semi-final. All
      // pools decided still qualifies whatever the count.
      if (scope === "division" && pools.length > 1 && !hasFinalsBracket) {
        const decided = pools.filter((s) => s.decided).length;
        const alive = states
          .filter((s) => s.groupNumber === groupNumber && s.section > 0)
          .reduce((n, s) => n + s.entrants.filter((e) => !e.eliminated).length, 0);
        const allDecided = decided === pools.length;
        const ready = leaguePlayoffReady(allDecided, alive);
        const label = allDecided
          ? leagueFinalStageLabel(pools.length)
          : leaguePlayoffStageLabel(alive).replace(/^./, (c) => c.toUpperCase());
        sorted = sorted.map((s) =>
          s.section > 0 && s.decided
            ? { ...s, headline: `${s.headline} The winner goes through to the ${label.toLowerCase()}.` }
            : s,
        );
        sorted.push({
          groupNumber,
          section: 0,
          stageLabel: label,
          nextStageLabel: null,
          activeCount: allDecided ? decided : alive,
          completed: 0,
          total: 0,
          unscheduled: 0,
          headline: ready
            ? allDecided
              ? `All ${pools.length} pool winners are decided — ready for the ${label.toLowerCase()}.`
              : `${alive} players still in across the pools — ready for the ${label.toLowerCase()}.`
            : `${label} pending — ${alive} players still in across the pools.`,
          action: ready ? "generate" : "await_results",
          actionLabel: ready ? `Generate ${label.toLowerCase()}` : null,
          canGenerate: ready,
          blockedReason: ready
            ? null
            : `A play-off needs every pool decided, or 2, 4 or 8 players still in — there are ${alive}.`,
          decided: false,
          winner: null,
          progression: null,
        });

        sorted.sort((a, b) => a.section - b.section);
      }

      // The play-off itself can need more than one round: three pool winners
      // means a semi-final and then a final. While two or more players are
      // still standing across the whole league the play-off is NOT decided.
      if (scope === "division" && pools.length > 1 && hasFinalsBracket) {
        const leagueStates = states.filter((s) => s.groupNumber === groupNumber);
        const alive = leagueSurvivorCount(leagueStates);
        if (alive > 1) {
          const ready = finalsReady(leagueStates);
          const label = leaguePlayoffStageLabel(alive).replace(/^./, (c) => c.toUpperCase());
          sorted = sorted.map((s) =>
            s.section === 0
              ? {
                  ...s,
                  decided: false,
                  winner: null,
                  stageLabel: label,
                  activeCount: alive,
                  headline: ready
                    ? `${alive} players still in — ready for the ${label.toLowerCase()}.`
                    : s.headline,
                  action: ready ? "generate" : s.action,
                  actionLabel: ready ? `Generate ${label.toLowerCase()}` : s.actionLabel,
                  canGenerate: ready || s.canGenerate,
                  blockedReason: ready ? null : s.blockedReason,
                }
              : s,
          );
        }
      }


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
  opts: { selfScheduled?: boolean; championScope?: ChampionScope } = {},
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

/** Knockout ("ko") and placement play-off ("playoff_*") rows. */
export const isPostPoolStage = (stage: unknown): boolean => {
  const s = String(stage || "");
  return s === "ko" || s.startsWith("playoff_");
};

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
  // Any persisted knockout OR placement play-off row means the next stage
  // already exists — never offer to generate it again.
  const hasKo = (matches as any[]).some(
    (m) => isPostPoolStage(m.stage) && Number(m.group_number) === Number(groupNumber),
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

/* ------------------------------------------------------------------ *
 * Tournament-level "next action"
 *
 * The card in the admin list and the banner on the tournament page must
 * agree, so both ask THIS function: given every match row plus the round
 * plan, what is the single next operational step for the whole event?
 * ------------------------------------------------------------------ */

export type TournamentStage =
  | "no_draw"
  | "pool_play"
  | "pool_complete"
  | "round_unscheduled"
  | "round_partially_scheduled"
  | "round_in_progress"
  | "round_complete"
  | "complete";

export type TournamentNextAction = {
  stage: TournamentStage;
  /** Short status chip, e.g. "Semi-finals in progress". */
  status: string;
  /** One-line explanation of the state. */
  headline: string;
  /** Primary CTA text, null when there is nothing to do. */
  ctaLabel: string | null;
  /** What the CTA does — drives deep-linking. */
  action: RoundAction | "setup";
  /** CTA is shown but not clickable while prerequisites are outstanding. */
  disabled: boolean;
  /** Why the CTA is disabled. */
  blockedReason: string | null;
  /** Division/section the CTA applies to (null for whole-event actions). */
  groupNumber: number | null;
  section: number | null;
  /** Whole event decided. */
  complete: boolean;
};

/**
 * Reduce every division/section to one prompt for the event.
 * Priority: generate > schedule > await results > done.
 */
export function tournamentNextAction(
  matches: KnockoutMatchLike[],
  rounds: ChampRound[] = [],
  opts: { selfScheduled?: boolean; status?: string | null; championScope?: ChampionScope } = {},
): TournamentNextAction {
  const ko = (matches as any[]).filter((m) => (m.stage || "") === "ko") as KnockoutMatchLike[];
  const divisions = divisionControls(ko, rounds, opts);
  const sections = divisions.flatMap((d) => d.sections);

  if (String(opts.status || "").toLowerCase() === "completed") {
    return {
      stage: "complete",
      status: "Tournament complete",
      headline: "This tournament is closed — no further progression.",
      ctaLabel: null,
      action: "none",
      disabled: false,
      blockedReason: null,
      groupNumber: null,
      section: null,
      complete: true,
    };
  }

  // Placement / legacy play-off rows (playoff_*) — lifecycle is derived
  // from the persisted rows, not from any "generated" flag.
  const playoffRows = (matches as any[]).filter((m) => String(m.stage || "").startsWith("playoff_") && !m.is_bye);
  if (sections.length === 0 && playoffRows.length > 0) {
    const done = playoffRows.filter((m) => DONE.has(String(m.status || "").toLowerCase())).length;
    const allDone = done === playoffRows.length;
    return {
      stage: allDone ? "complete" : "round_in_progress",
      status: allDone ? "Tournament complete" : "Play-offs in progress",
      headline: allDone
        ? "All play-offs are played — final positions are decided."
        : `Play-offs — ${done} of ${playoffRows.length} results entered.`,
      ctaLabel: allDone ? null : "Enter remaining results",
      action: allDone ? "none" : "await_results",
      disabled: false,
      blockedReason: null,
      groupNumber: null,
      section: null,
      complete: allDone,
    };
  }

  if (sections.length === 0) {
    // No knockout yet — fall back to the pool stage of each division.
    const gns = Array.from(
      new Set(
        (matches as any[])
          .filter((m) => (m.stage || "group") === "group")
          .map((m) => Number(m.group_number)),
      ),
    ).sort((a, b) => a - b);
    const pools = gns
      .map((gn) => groupStageControl(matches, gn))
      .filter(Boolean) as GroupStageControl[];

    if (pools.length === 0) {
      return {
        stage: "no_draw",
        status: "Not started",
        headline: "The draw has not been generated yet.",
        ctaLabel: "Review & Generate",
        action: "setup",
        disabled: false,
        blockedReason: null,
        groupNumber: null,
        section: null,
        complete: false,
      };
    }

    const ready = pools.find((p) => p.action === "generate");
    if (ready) {
      return {
        stage: "pool_complete",
        status: "Pool stage complete",
        headline: ready.headline,
        ctaLabel: "Generate knockout round",
        action: "generate",
        disabled: false,
        blockedReason: null,
        groupNumber: ready.groupNumber,
        section: null,
        complete: false,
      };
    }
    const played = pools.reduce((n, p) => n + p.played, 0);
    const total = pools.reduce((n, p) => n + p.total, 0);
    return {
      stage: "pool_play",
      status: "Pool stage in progress",
      headline: `Pool stage — ${played} of ${total} results entered.`,
      ctaLabel: "Enter remaining results",
      action: "await_results",
      disabled: false,
      blockedReason: null,
      groupNumber: pools[0].groupNumber,
      section: null,
      complete: false,
    };
  }

  if (sections.every((s) => s.decided)) {
    return {
      stage: "complete",
      status: "Tournament complete",
      headline: "Every division is decided. Close the tournament when you are ready.",
      ctaLabel: null,
      action: "none",
      disabled: false,
      blockedReason: null,
      groupNumber: null,
      section: null,
      complete: true,
    };
  }

  const live = sections.filter((s) => !s.decided);
  const focus =
    [...live].sort(
      (a, b) =>
        PRIORITY[a.action] - PRIORITY[b.action] ||
        a.groupNumber - b.groupNumber ||
        a.section - b.section,
    )[0];

  const stageName = focus.stageLabel;

  if (focus.action === "generate") {
    return {
      stage: "round_complete",
      status: `${stageName} complete`,
      headline: focus.headline,
      ctaLabel: focus.actionLabel || "Generate next round",
      action: "generate",
      disabled: false,
      blockedReason: null,
      groupNumber: focus.groupNumber,
      section: focus.section,
      complete: false,
    };
  }

  if (focus.action === "schedule") {
    const partial = focus.unscheduled < focus.total;
    return {
      stage: partial ? "round_partially_scheduled" : "round_unscheduled",
      status: `${stageName} — scheduling`,
      headline: focus.headline,
      ctaLabel: partial
        ? `Finish scheduling ${stageName}`
        : `Set dates & courts for ${stageName}`,
      action: "schedule",
      disabled: false,
      blockedReason: null,
      groupNumber: focus.groupNumber,
      section: focus.section,
      complete: false,
    };
  }

  // Waiting on results. If the next round exists in the plan, say why it can't
  // be generated yet instead of hiding the button.
  const blocked = !!focus.progression?.nextRound && !focus.canGenerate;
  return {
    stage: "round_in_progress",
    status: `${stageName} in progress`,
    headline: focus.headline,
    ctaLabel: blocked
      ? `Generate ${focus.nextStageLabel ?? "next round"}`
      : "Enter remaining results",
    action: blocked ? "generate" : "await_results",
    disabled: !!blocked,
    blockedReason: blocked
      ? focus.blockedReason || `${stageName} must be played out first.`
      : null,
    groupNumber: focus.groupNumber,
    section: focus.section,
    complete: false,
  };
}
