/**
 * Settled Swiss analysis — which next-round positions and pairings are already mathematically
 * fixed, even though some games of the current round are still undecided.
 *
 * An outstanding game can change its two players' points AND every opponent's Buchholz /
 * Sonneborn-Berger, and the no-repeat matcher pairs globally — so "both players' own games are
 * done" is NOT enough to call a fixture safe. Instead we enumerate every win/loss outcome of the
 * outstanding games (score margins do not affect standings: a win is one point), recompute the
 * shared `swissTable` and the shared `sequenceSwissRound` optimizer for each scenario, and keep
 * only what is identical across ALL scenarios:
 *
 *  - settledPositions: player -> rank identical in every scenario;
 *  - stablePairs: pairings the optimizer produces in every scenario, restricted to players whose
 *    own current-round game is final (the server guard requires that before creating a game).
 *
 * Pure and read-only. Capped at MAX_OUTSTANDING undecided games; beyond that the caller falls
 * back to the normal "wait for the round to finish" rule.
 */
import { swissTable, isPositionSwap, type SwissGame } from "./swiss-standings";
import { sequenceSwissRound, swissOpponentKey } from "./swiss-sequencing";

export const MAX_SETTLED_OUTSTANDING = 8;

export interface SettledSwissInput {
  /** Entrant ids in original seed order. */
  seedOrder: string[];
  /** Decided games of every round up to and including the current one (winner set; bye = b null). */
  decidedGames: SwissGame[];
  /** Undecided real games of the current round (both players known, no winner). */
  outstanding: Array<{ a: string; b: string }>;
  /** Round being paired (the next round) and the stage's final round. */
  round: number;
  finalRound: number;
  tieBreaks?: readonly string[] | null;
}

export interface SettledSwissResult {
  enumerable: boolean;
  outstanding: number;
  scenarios: number;
  settledPositions: Map<string, number>;
  stablePairs: Array<[string, string]>;
}

export function settledSwiss(input: SettledSwissInput): SettledSwissResult {
  const { seedOrder, decidedGames, outstanding, round, finalRound, tieBreaks } = input;
  const empty: SettledSwissResult = {
    enumerable: false, outstanding: outstanding.length, scenarios: 0,
    settledPositions: new Map(), stablePairs: [],
  };
  if (outstanding.length > MAX_SETTLED_OUTSTANDING) return empty;
  if (outstanding.some((g) => !g.a || !g.b || g.a === g.b)) return empty;

  const undecidedPlayers = new Set(outstanding.flatMap((g) => [g.a, g.b]));
  const played = new Set(decidedGames.filter((g) => g.a && g.b).map((g) => swissOpponentKey(g.a!, g.b!)));
  for (const g of outstanding) played.add(swissOpponentKey(g.a, g.b)); // they meet in every scenario

  const combos = 1 << outstanding.length;
  let positions: Map<string, number> | null = null;
  let commonPairs: Set<string> | null = null;
  for (let mask = 0; mask < combos; mask++) {
    const games: SwissGame[] = [
      ...decidedGames,
      ...outstanding.map((g, i) => ({ a: g.a, b: g.b, winner: mask & (1 << i) ? g.a : g.b, round: round - 1 })),
    ];
    const table = swissTable(seedOrder, games, tieBreaks);
    const here = new Map(table.map((r) => [r.id, r.position]));
    positions = positions === null
      ? here
      : new Map([...positions].flatMap(([id, pos]) => (here.get(id) === pos ? [[id, pos] as const] : [])));
    let result: ReturnType<typeof sequenceSwissRound>;
    try {
      result = sequenceSwissRound({
        players: table.map((r, i) => ({ ...r, points: isPositionSwap(tieBreaks) ? 0 : r.points, seed: i + 1 })),
        played, round, finalRound,
      });
    } catch {
      return empty; // one legal completion has no pairing at all — nothing is provably safe
    }
    const keys = new Set(result.pairs.filter((p): p is [string, string] => !!p[1]).map(([a, b]) => swissOpponentKey(a, b)));
    commonPairs = commonPairs === null ? keys : new Set([...commonPairs].filter((k) => keys.has(k)));
    if (positions.size === 0 && commonPairs.size === 0) break;
  }

  const stablePairs = [...(commonPairs ?? [])]
    .map((k) => k.split("|") as [string, string])
    .filter(([a, b]) => !undecidedPlayers.has(a) && !undecidedPlayers.has(b));
  return {
    enumerable: true, outstanding: outstanding.length, scenarios: combos,
    settledPositions: positions ?? new Map(), stablePairs,
  };
}
