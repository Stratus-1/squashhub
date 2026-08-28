/**
 * The lightweight "define the next round" step that sits between the tournament
 * card's next action and the visual draw.
 *
 * The organiser is asked for the minimum a round needs to exist — what it is
 * called and when it must be played by — and nothing else. Everything else
 * (who is in it, when each match is, which court) is decided by the steps that
 * follow: Visual Draw -> Confirm -> Dates & Courts -> Results.
 *
 * Also holds the adaptive-layout rules for the draw board: a small round keeps
 * the bracket cards, a large round (e.g. 50 pairings) switches to a compact
 * editable list that is filtered to one division/section at a time.
 *
 * Pure logic: no React, no network.
 */
import type { DrawBoard } from "./draw-board";
import { winnerOf } from "./knockout";
import type { SectionProgression } from "./knockout-progression";

/* ------------------------------------------------------------------ *
 * Stage naming
 * ------------------------------------------------------------------ */

/** Contextual stage name from how many qualifiers start the round. */
export function stageNameForQualifiers(qualifiers: number, roundNumber: number): string {
  if (qualifiers === 2) return "Final";
  if (qualifiers === 3 || qualifiers === 4) return "Semi-final";
  if (qualifiers > 4 && qualifiers <= 8) return "Quarter-final";
  if (qualifiers > 8) {
    let bracket = 2;
    while (bracket < qualifiers) bracket *= 2;
    return `Round of ${bracket}`;
  }
  return `Round ${roundNumber}`;
}

/**
 * What the popup pre-fills. A label the organiser already configured in the
 * round plan always wins — we never rename their plan behind their back.
 */
export function suggestStageName(opts: {
  plannedLabel?: string | null;
  roundNumber: number;
  qualifiers: number;
}): string {
  const planned = String(opts.plannedLabel || "").trim();
  if (planned) return planned;
  // Neutral by default — the organiser decides if this is a quarter/semi/final.
  return `Round ${opts.roundNumber}`;
}

/** Alternatives offered as one-click chips in the popup. */
export function stageNameOptions(qualifiers: number, roundNumber: number): string[] {
  const out = [stageNameForQualifiers(qualifiers, roundNumber), `Round ${roundNumber}`];
  for (const extra of ["Quarter-final", "Semi-final", "Final"]) {
    if (!out.includes(extra)) out.push(extra);
  }
  return Array.from(new Set(out));
}

/* ------------------------------------------------------------------ *
 * The setup payload
 * ------------------------------------------------------------------ */

export type NextRoundSetup = {
  /** Stage/round name shown everywhere for this round. */
  label: string;
  /** ISO date (yyyy-mm-dd) the round must be completed by, or null. */
  playBy: string | null;
};

export type NextRoundScope = {
  key: string;
  groupNumber: number;
  section: number;
  roundNumber: number;
  qualifierIds: string[];
  qualifiers: number;
  matchups: number;
  stageLabel: string;
};

/** Every independently confirmable next-round draw that is ready now. */
export function readyNextRoundScopes(states: SectionProgression[]): NextRoundScope[] {
  return states
    .filter((state) => state.section > 0 && state.canGenerateNext && state.currentRoundComplete)
    .map((state) => {
      const qualifierIds = Array.from(
        new Set(state.currentRoundMatches.map((match) => winnerOf(match)).filter(Boolean) as string[]),
      );
      const roundNumber = state.nextRound?.round_number ?? state.currentRound + 1;
      return {
        key: `${state.groupNumber}-${state.section}`,
        groupNumber: state.groupNumber,
        section: state.section,
        roundNumber,
        qualifierIds,
        qualifiers: qualifierIds.length,
        matchups: Math.ceil(qualifierIds.length / 2),
        stageLabel: `Round ${roundNumber}`,
      };
    })
    .sort((a, b) => a.groupNumber - b.groupNumber || a.section - b.section);
}

/* ------------------------------------------------------------------ *
 * Guided queue: prepare every ready draw, one after the other
 * ------------------------------------------------------------------ */

/**
 * The ready draws that still have no confirmed round, in order.
 *
 * `preparedKeys` are the scopes confirmed during this session — the live match
 * rows can lag a refetch by a moment, so the queue never re-offers a draw the
 * organiser has just confirmed.
 */
export function remainingNextRoundScopes(
  scopes: NextRoundScope[],
  preparedKeys: Iterable<string> = [],
): NextRoundScope[] {
  const done = new Set(preparedKeys);
  return scopes.filter((scope) => !done.has(scope.key));
}

/** The draw the organiser should be taken to next, or null when the queue is empty. */
export function nextOutstandingScope(
  scopes: NextRoundScope[],
  preparedKeys: Iterable<string> = [],
): NextRoundScope | null {
  return remainingNextRoundScopes(scopes, preparedKeys)[0] ?? null;
}

/** Plain-English state of the queue, e.g. "3 draws still need preparation". */
export function outstandingDrawsHeadline(remaining: number): string | null {
  if (remaining <= 0) return null;
  if (remaining === 1) return "1 draw still needs preparation.";
  return `${remaining} draws still need preparation.`;
}

/* ------------------------------------------------------------------ *
 * One page vs step by step
 * ------------------------------------------------------------------ */

/** Most matchups that can sensibly be drawn together on a single page. */
export const SINGLE_PAGE_MATCH_LIMIT = 16;
/** Most independent draws (division/pool boards) shown on a single page. */
export const SINGLE_PAGE_SCOPE_LIMIT = 6;

export type SinglePageFit = {
  /** Draw every outstanding scope on one page instead of one-by-one. */
  fits: boolean;
  scopes: number;
  totalQualifiers: number;
  totalMatchups: number;
  /** Why it has to be step by step (null when it fits). */
  reason: string | null;
};

/**
 * Can every outstanding draw be arranged on one board page?
 *
 * Small tournaments (and every late stage — quarters, semis, finals) fit, so
 * the organiser sees the whole board at once and can move players across
 * divisions/pools where the format allows it. Anything bigger stays a guided
 * step-by-step queue so no pool gets lost in the scroll.
 */
export function allDrawsFitOnePage(
  scopes: Pick<NextRoundScope, "qualifiers" | "matchups">[],
  opts: { matchLimit?: number; scopeLimit?: number } = {},
): SinglePageFit {
  const matchLimit = opts.matchLimit ?? SINGLE_PAGE_MATCH_LIMIT;
  const scopeLimit = opts.scopeLimit ?? SINGLE_PAGE_SCOPE_LIMIT;
  const totalQualifiers = scopes.reduce((t, s) => t + s.qualifiers, 0);
  const totalMatchups = scopes.reduce((t, s) => t + s.matchups, 0);
  let reason: string | null = null;
  if (scopes.length === 0) reason = "There is nothing to draw.";
  else if (scopes.length > scopeLimit) reason = `${scopes.length} separate draws is too many for one page.`;
  else if (totalMatchups > matchLimit) reason = `${totalMatchups} matchups is too many for one page.`;
  return { fits: reason === null, scopes: scopes.length, totalQualifiers, totalMatchups, reason };
}



/** Default play-by suggestion: `days` from today, as yyyy-mm-dd. */
export function defaultPlayBy(from: Date = new Date(), days = 7): string {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Organiser-facing validation. Returns problems, [] = ok to continue. */
export function validateNextRoundSetup(
  setup: NextRoundSetup,
  opts: { requirePlayBy?: boolean; today?: string } = {},
): string[] {
  const problems: string[] = [];
  if (!String(setup.label || "").trim()) problems.push("Give this round a name.");
  if (String(setup.label || "").trim().length > 60) problems.push("Round name is too long (60 characters max).");
  if (opts.requirePlayBy && !setup.playBy) problems.push("Set the date this round must be played by.");
  if (setup.playBy && !/^\d{4}-\d{2}-\d{2}$/.test(setup.playBy)) problems.push("Play-by date is not a valid date.");
  if (setup.playBy && opts.today && /^\d{4}-\d{2}-\d{2}$/.test(setup.playBy) && setup.playBy < opts.today) {
    problems.push("Play-by date is in the past.");
  }
  return problems;
}

/* ------------------------------------------------------------------ *
 * Adaptive draw layout
 * ------------------------------------------------------------------ */

export type DrawLayout = "bracket" | "list";

/** Rounds up to `threshold` matchups keep the bracket cards; bigger rounds list. */
export const LARGE_ROUND_THRESHOLD = 16;

export function drawLayout(matchCount: number, threshold: number = LARGE_ROUND_THRESHOLD): DrawLayout {
  return matchCount > threshold ? "list" : "bracket";
}

export type BoardProgress = {
  matches: number;
  /** Both slots filled — a real playable matchup. */
  complete: number;
  /** Missing a player (bye or still to be filled). */
  incomplete: number;
  byes: number;
  empty: number;
  /** "32 matches in this round · 8 incomplete" */
  summary: string;
};

export function boardProgress(board: Pick<DrawBoard, "matches">): BoardProgress {
  const rows = board.matches || [];
  let complete = 0;
  let byes = 0;
  let empty = 0;
  for (const m of rows) {
    if (m.a && m.b) complete += 1;
    else if (m.a || m.b) byes += 1;
    else empty += 1;
  }
  const incomplete = byes + empty;
  return {
    matches: rows.length,
    complete,
    incomplete,
    byes,
    empty,
    summary: `${rows.length} match${rows.length === 1 ? "" : "es"} in this round · ${incomplete} incomplete`,
  };
}

/** Section numbers present on a board, ascending. */
export function sectionsOf(board: Pick<DrawBoard, "matches">): number[] {
  return Array.from(new Set((board.matches || []).map((m) => m.section))).sort((a, b) => a - b);
}

/**
 * The slice the organiser is editing. Filtering is what keeps a huge round
 * manageable — and because out-of-scope slots are not rendered, a drag can
 * never cross into another division/section.
 */
export function matchesInScope(
  board: Pick<DrawBoard, "matches">,
  section: number | "all",
): DrawBoard["matches"] {
  const rows = [...(board.matches || [])].sort(
    (a, b) => a.section - b.section || a.position - b.position,
  );
  return section === "all" ? rows : rows.filter((m) => m.section === section);
}
