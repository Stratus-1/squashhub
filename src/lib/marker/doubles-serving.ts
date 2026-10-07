/**
 * Doubles serving state machine for the live marker.
 *
 * Pure logic — no React, no storage. The marker screen keeps one
 * `DoublesServeState` and replaces it after every rally, game change or
 * marker correction. Singles never touches this module.
 *
 * Methods (configured per competition, see `doubles_serving_method`):
 *  - even_odd:      Forehand is the pair's first server in a game, then partners
 *                   alternate each time the pair regains service; the SIDE comes
 *                   only from the COMBINED score of both pairs (total even →
 *                   RIGHT, odd → LEFT). Side never decides which partner serves.
 *  - by_position:   Forehand is the first server, partners alternate on each
 *                   regain. Position sets only where a service turn STARTS
 *                   (Forehand RIGHT, Backhand LEFT); each further point won
 *                   by the same server alternates the box (R,L,R… / L,R,L…).
 *  - second_server: each hand = Forehand (RIGHT) then Backhand (LEFT), then
 *                   service transfers to the other pair, which starts again
 *                   with its Forehand player.
 */

export type DoublesServingMethod = "even_odd" | "by_position" | "second_server";
export type Team = "a" | "b";
export type ServeSide = "R" | "L";
/** Index of a player inside a pair (0 = first listed, 1 = second listed). */
export type Slot = 0 | 1;

export const DOUBLES_SERVING_METHODS: { value: DoublesServingMethod; label: string; hint: string }[] = [
  { value: "even_odd", label: "Even / Odd", hint: "Forehand serves first, then partners alternate when the pair wins service back. Side: both pairs' points added together — even total → RIGHT, odd → LEFT." },
  { value: "by_position", label: "By position", hint: "Forehand serves first, then partners alternate when the pair wins service back. Each turn starts Forehand RIGHT / Backhand LEFT, then the server alternates boxes on every point won." },
  { value: "second_server", label: "Second server", hint: "Each pair serves Forehand (RIGHT) then Backhand (LEFT) before service passes to the other pair." },
];

export function parseServingMethod(raw: unknown): DoublesServingMethod | null {
  return raw === "even_odd" || raw === "by_position" || raw === "second_server" ? raw : null;
}

export interface PairPositions {
  /** Which slot plays Forehand (right wall). The other slot is Backhand. */
  a: { forehand: Slot };
  b: { forehand: Slot };
}

export interface DoublesServeState {
  version: 1;
  method: DoublesServingMethod;
  positions: PairPositions;
  /** Pair currently serving. */
  team: Team;
  /** Slot of the current server inside the serving pair. */
  server: Slot;
  side: ServeSide;
  /** Last player to serve for each pair (null = pair hasn't served yet). */
  prevServer: { a: Slot | null; b: Slot | null };
  /** Each pair's first server in a game — always its Forehand player. */
  firstServer: { a: Slot; b: Slot };
  /** second_server only: 1 = first server of this hand, 2 = second server. */
  hand: 1 | 2;
}

export interface Scores { a: number; b: number }

const other = (t: Team): Team => (t === "a" ? "b" : "a");
const flip = (s: Slot): Slot => (s === 0 ? 1 : 0);

export function isForehand(positions: PairPositions, team: Team, slot: Slot): boolean {
  return positions[team].forehand === slot;
}

function positionSide(positions: PairPositions, team: Team, slot: Slot): ServeSide {
  return isForehand(positions, team, slot) ? "R" : "L";
}

/** Even/Odd service box: combined score of both pairs — even → RIGHT, odd → LEFT. */
export function evenOddSide(scores: Scores): ServeSide {
  return (scores.a + scores.b) % 2 === 0 ? "R" : "L";
}

/** Correct side for the given server under the method, at the given score. */
export function sideFor(method: DoublesServingMethod, positions: PairPositions, team: Team, slot: Slot, scores: Scores): ServeSide {
  if (method === "even_odd") return evenOddSide(scores);
  return positionSide(positions, team, slot);
}

/** Server for `team` when it (re)gains service under alternating methods. */
function nextAlternatingServer(state: DoublesServeState, team: Team): Slot {
  const prev = state.prevServer[team];
  return prev == null ? state.firstServer[team] : flip(prev);
}

export interface StartInput {
  method: DoublesServingMethod;
  positions: PairPositions;
  /** Pair serving first (toss winner / current serving pair when resuming). */
  servingTeam: Team;
  /** Current score (0-0 at the start; live score when resuming mid-game). */
  scores?: Scores;
}

export function startDoubles(input: StartInput): DoublesServeState {
  const { method, positions, servingTeam } = input;
  const scores = input.scores ?? { a: 0, b: 0 };
  // Forehand is always a pair's first server (every method).
  const firstServer = { a: positions.a.forehand, b: positions.b.forehand };
  const server: Slot = positions[servingTeam].forehand;
  return {
    version: 1,
    method,
    positions,
    team: servingTeam,
    server,
    side: sideFor(method, positions, servingTeam, server, scores),
    prevServer: { a: null, b: null, [servingTeam]: server } as DoublesServeState["prevServer"],
    firstServer,
    hand: 1,
  };
}

/**
 * Apply one rally. `scores` is the score AFTER the rally (unchanged for an
 * English hand-out where no point is scored).
 */
export function afterRally(state: DoublesServeState, winner: Team, scores: Scores): DoublesServeState {
  const { method, positions } = state;
  if (winner === state.team) {
    // Serving pair keeps service with the same server.
    if (method === "by_position") {
      // Position is only the starting box of the turn; consecutive serves alternate.
      return { ...state, side: state.side === "R" ? "L" : "R" };
    }
    return { ...state, side: sideFor(method, positions, state.team, state.server, scores) };
  }

  if (method === "second_server") {
    if (state.hand === 1) {
      const server = flip(positions[state.team].forehand); // backhand
      return {
        ...state,
        hand: 2,
        server,
        side: positionSide(positions, state.team, server),
        prevServer: { ...state.prevServer, [state.team]: server },
      };
    }
    const team = other(state.team);
    const server = positions[team].forehand;
    return {
      ...state,
      team,
      hand: 1,
      server,
      side: "R",
      prevServer: { ...state.prevServer, [team]: server },
    };
  }

  const team = other(state.team);
  const server = nextAlternatingServer(state, team);
  return {
    ...state,
    team,
    server,
    hand: 1,
    side: sideFor(method, positions, team, server, scores),
    prevServer: { ...state.prevServer, [team]: server },
  };
}

/**
 * New game. `servingTeam` is the pair ENTITLED to first service under the
 * match's own first-service rule (decided by the caller / marker) — this
 * module never decides which pair serves. Server alternation is reset so each
 * pair's Forehand player is its first server in the new game; the last server
 * of the previous game does NOT carry over. Second server always starts a
 * fresh sequence: Forehand RIGHT, then Backhand LEFT.
 */
export function startNextGame(state: DoublesServeState, servingTeam: Team): DoublesServeState {
  return startDoubles({ method: state.method, positions: state.positions, servingTeam });
}

export interface OverrideInput {
  team: Team;
  server: Slot;
  /** Optional explicit side. Defaults to the method's side for this server. */
  side?: ServeSide;
  scores: Scores;
}

/**
 * Marker correction. Rewrites the internal state so every following rally is
 * calculated from the corrected server (not just the display).
 */
export function overrideServer(state: DoublesServeState, input: OverrideInput): DoublesServeState {
  const { team, server, scores } = input;
  const hand: 1 | 2 = state.method === "second_server"
    ? (isForehand(state.positions, team, server) ? 1 : 2)
    : 1;
  return {
    ...state,
    team,
    server,
    hand,
    side: input.side ?? sideFor(state.method, state.positions, team, server, scores),
    prevServer: { ...state.prevServer, [team]: server },
  };
}

/** Validate a persisted state (localStorage) — returns null when unusable. */
export function restoreDoublesState(raw: unknown, method: DoublesServingMethod | null): DoublesServeState | null {
  if (!raw || typeof raw !== "object" || !method) return null;
  const s = raw as Partial<DoublesServeState>;
  const slot = (v: unknown): v is Slot => v === 0 || v === 1;
  const team = (v: unknown): v is Team => v === "a" || v === "b";
  if (s.version !== 1 || s.method !== method) return null;
  if (!s.positions || !slot(s.positions.a?.forehand) || !slot(s.positions.b?.forehand)) return null;
  if (!team(s.team) || !slot(s.server) || (s.side !== "R" && s.side !== "L")) return null;
  if (!s.firstServer || !slot(s.firstServer.a) || !slot(s.firstServer.b)) return null;
  const prev = s.prevServer ?? { a: null, b: null };
  return {
    version: 1,
    method,
    positions: { a: { forehand: s.positions.a.forehand }, b: { forehand: s.positions.b.forehand } },
    team: s.team,
    server: s.server,
    side: s.side,
    prevServer: { a: slot(prev.a) ? prev.a : null, b: slot(prev.b) ? prev.b : null },
    firstServer: { a: s.firstServer.a, b: s.firstServer.b },
    hand: s.hand === 2 ? 2 : 1,
  };
}

// ---------- Display helpers ----------

export type PairNames = [string, string];

/** Both players of a pair, e.g. "Dave Smith & John Doe". */
export function pairDisplayName(pair: PairNames): string {
  return `${pair[0]} & ${pair[1]}`;
}

export function sideWord(side: ServeSide): "RIGHT" | "LEFT" {
  return side === "R" ? "RIGHT" : "LEFT";
}

/** "Dave Smith — SERVE RIGHT" */
export function servingBanner(state: DoublesServeState, pairs: { a: PairNames; b: PairNames }): string {
  return `${pairs[state.team][state.server]} — SERVE ${sideWord(state.side)}`;
}

export function methodLabel(method: DoublesServingMethod | null): string {
  return DOUBLES_SERVING_METHODS.find((m) => m.value === method)?.label ?? "Not set";
}

interface ConfigLike {
  isDoubles?: boolean;
  playerA: { name: string };
  playerB: { name: string };
  partnerA?: { name?: string } | null;
  partnerB?: { name?: string } | null;
  doublesServing?: { method: DoublesServingMethod | null; pairA: PairNames; pairB: PairNames } | null;
}

/**
 * Doubles pairs for a marker config, or null for singles. Singles configs
 * (no partners, no explicit pairs) always return null so singles scoring is
 * never touched.
 */
export function resolveDoublesPairs(config: ConfigLike): { method: DoublesServingMethod | null; a: PairNames; b: PairNames } | null {
  if (config.doublesServing) {
    const { pairA, pairB, method } = config.doublesServing;
    if (pairA?.[0] && pairA?.[1] && pairB?.[0] && pairB?.[1]) return { method: parseServingMethod(method), a: pairA, b: pairB };
    return null;
  }
  if (config.isDoubles && config.partnerA?.name && config.partnerB?.name) {
    return {
      method: null,
      a: [config.playerA.name, config.partnerA.name],
      b: [config.playerB.name, config.partnerB.name],
    };
  }
  return null;
}
