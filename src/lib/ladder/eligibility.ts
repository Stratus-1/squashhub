/**
 * Central ladder challenge eligibility logic.
 *
 * Mirrors the database trigger `validate_challenge_insert()` so the UI can
 * show/hide challenge buttons without a round trip. The DB remains
 * authoritative — never treat this as the only gate.
 */

export type LadderFormat = "standard" | "pyramid";

export interface LadderConfig {
  id?: string;
  club_id?: string;
  format: LadderFormat;
  challenge_levels_up: number;
  pyramid_row_sizes: number[] | null;
  accept_deadline_hours: number;
  complete_deadline_days: number;
  max_active_outgoing: number;
  max_active_incoming: number;
  rematch_cooldown_days: number;
  movement_policy: "swap" | "insert";
  affects_club_ranking: boolean;
  /** How challenge results feed the club ranking points leaderboard. */
  ranking_sync_mode: "none" | "formula" | "mirror";
  /** In mirror mode, how far above the beaten player the winner lands. */
  ranking_mirror_margin: number;
  /** Post challenge points immediately instead of queuing for admin approval. */
  ranking_auto_approve: boolean;
  /** Apply ladder moves immediately; false = queue for admin approval. */
  ladder_auto_apply: boolean;
  /** League rubbers between two ranked club members may move the ladder. */
  ladder_from_leagues: boolean;
  /** Championship / tournament results between two ranked club members may move the ladder. */
  ladder_from_tournaments: boolean;
  /** Movement style for league results. null = inherit `movement_policy`. */
  league_movement_policy: "swap" | "insert" | null;
  /** Movement style for championship / tournament results. null = inherit `movement_policy`. */
  tournament_movement_policy: "swap" | "insert" | null;
  is_active: boolean;
}

export const DEFAULT_LADDER_CONFIG: LadderConfig = {
  format: "standard",
  challenge_levels_up: 2,
  pyramid_row_sizes: null,
  accept_deadline_hours: 72,
  complete_deadline_days: 14,
  max_active_outgoing: 1,
  max_active_incoming: 1,
  rematch_cooldown_days: 0,
  movement_policy: "swap",
  affects_club_ranking: false,
  ranking_sync_mode: "formula",
  ranking_mirror_margin: 1,
  ranking_auto_approve: false,
  ladder_auto_apply: true,
  ladder_from_leagues: true,
  ladder_from_tournaments: true,
  league_movement_policy: null,
  tournament_movement_policy: null,
  is_active: true,
};

/** Size of pyramid row `row` (1-based). Defaults to the triangular 1,2,3,… shape. */
export function pyramidRowSize(row: number, rowSizes?: number[] | null): number {
  if (rowSizes && rowSizes.length >= row) {
    const s = Number(rowSizes[row - 1]);
    if (Number.isFinite(s) && s >= 1) return Math.floor(s);
  }
  return row;
}

/** 1-based pyramid row containing a ladder position, or null when invalid. */
export function pyramidRowFor(position: number, rowSizes?: number[] | null): number | null {
  if (!Number.isFinite(position) || position < 1) return null;
  let row = 1;
  let consumed = 0;
  while (row <= 1000) {
    consumed += pyramidRowSize(row, rowSizes);
    if (position <= consumed) return row;
    row += 1;
  }
  return null;
}

/** Inclusive [first, last] ladder positions of a pyramid row. */
export function pyramidRowRange(row: number, rowSizes?: number[] | null): { first: number; last: number } {
  let first = 1;
  for (let r = 1; r < row; r++) first += pyramidRowSize(r, rowSizes);
  return { first, last: first + pyramidRowSize(row, rowSizes) - 1 };
}

/** Split a list of positions into pyramid rows. */
export function buildPyramidRows<T>(items: T[], rowSizes?: number[] | null): T[][] {
  const rows: T[][] = [];
  let i = 0;
  let row = 1;
  while (i < items.length) {
    const size = pyramidRowSize(row, rowSizes);
    rows.push(items.slice(i, i + size));
    i += size;
    row += 1;
  }
  return rows;
}

export interface EligibilityInput {
  config: LadderConfig;
  myPosition: number | null;
  opponentPosition: number | null;
  sameGenderGroup: boolean;
  /** Open (pending/accepted) challenges I have started. */
  myOpenOutgoing?: number;
  /** Open (pending/accepted) challenges the opponent has received. */
  opponentOpenIncoming?: number;
  /** Days since these two last completed a challenge, if ever. */
  daysSinceLastMeeting?: number | null;
}

export interface EligibilityResult {
  allowed: boolean;
  /** Null when allowed, or when the button should simply be hidden. */
  reason: string | null;
  /** True when the pairing is irrelevant (self / other ladder) — hide, don't explain. */
  hidden: boolean;
}

const ok: EligibilityResult = { allowed: true, reason: null, hidden: false };
const hide: EligibilityResult = { allowed: false, reason: null, hidden: true };
const no = (reason: string): EligibilityResult => ({ allowed: false, reason, hidden: false });

/** Can I challenge this opponent under the club's ladder configuration? */
export function evaluateChallenge(input: EligibilityInput): EligibilityResult {
  const {
    config,
    myPosition,
    opponentPosition,
    sameGenderGroup,
    myOpenOutgoing = 0,
    opponentOpenIncoming = 0,
    daysSinceLastMeeting = null,
  } = input;

  if (!sameGenderGroup) return hide;
  if (!config.is_active) return no("Challenges are currently paused for this club.");
  if (!myPosition) return no("You are not ranked on the ladder yet.");
  if (!opponentPosition) return no("This player is not ranked on the ladder.");
  if (myPosition === opponentPosition) return hide;
  if (myPosition < opponentPosition) return no("You may only challenge players above you.");

  if (config.format === "pyramid") {
    const myRow = pyramidRowFor(myPosition, config.pyramid_row_sizes);
    const oppRow = pyramidRowFor(opponentPosition, config.pyramid_row_sizes);
    if (!myRow || !oppRow) return no("Ladder rows could not be calculated.");
    if (oppRow !== myRow - 1) {
      return no("You may only challenge players in the row directly above you.");
    }
  } else {
    const gap = myPosition - opponentPosition;
    if (gap > config.challenge_levels_up) {
      return no(
        `You can only challenge up to ${config.challenge_levels_up} position${config.challenge_levels_up === 1 ? "" : "s"} above you.`,
      );
    }
  }

  if (config.max_active_outgoing > 0 && myOpenOutgoing >= config.max_active_outgoing) {
    return no(
      config.max_active_outgoing === 1
        ? "You already have an open challenge — finish that one first."
        : `You already have ${config.max_active_outgoing} open challenges.`,
    );
  }

  if (config.max_active_incoming > 0 && opponentOpenIncoming >= config.max_active_incoming) {
    return no("This player already has the maximum number of open challenges.");
  }

  if (
    config.rematch_cooldown_days > 0 &&
    daysSinceLastMeeting != null &&
    daysSinceLastMeeting < config.rematch_cooldown_days
  ) {
    const wait = Math.ceil(config.rematch_cooldown_days - daysSinceLastMeeting);
    return no(`You can challenge this player again in ${wait} day${wait === 1 ? "" : "s"}.`);
  }

  return ok;
}

/** Human-readable summary of the club's challenge rule, for headers and help text. */
export function describeLadderRule(config: LadderConfig): string {
  if (config.format === "pyramid") {
    return "Pyramid ladder — you may challenge anyone in the row directly above you.";
  }
  const n = config.challenge_levels_up;
  return `Positional ladder — you may challenge up to ${n} position${n === 1 ? "" : "s"} above you.`;
}
