/**
 * Swiss progression table (Riverside pilot, display only).
 *
 * Replays the SAME shared Swiss ranking (`swissTable`) round by round so each row
 * carries a per-round cell (opponent, W/L, score, BYE) and the movement since the
 * previous completed round. Never writes anything; never changes the ranking rule.
 *
 * Defaults (pilot, until confirmed otherwise):
 *  - A bye counts exactly as `swissTable` already counts it (a win); in position-swap
 *    mode it moves nobody.
 *  - Undecided games show as "pending" and move nobody.
 *  - Withdrawn entrants stay listed, greyed, after everyone still in the running.
 */
import { swissTable, isPositionSwap, type SwissGame } from "./swiss-standings";

export interface ProgressionGame extends SwissGame {
  /** Score from side A's point of view, e.g. "3-1". */
  score?: string | null;
}

export type ProgressionCell =
  | { kind: "bye" }
  | { kind: "pending"; opponent: string }
  | { kind: "result"; opponent: string; won: boolean; score: string | null }
  | { kind: "none" };

export interface ProgressionRow {
  id: string;
  seed: number;
  position: number;
  /** Positive = places gained since the previous round; null when there is no previous round. */
  movement: number | null;
  points: number;
  played: number;
  wins: number;
  losses: number;
  withdrawn: boolean;
  cells: ProgressionCell[];
}

export interface ProgressionTable {
  rounds: number[];
  positionSwap: boolean;
  rows: ProgressionRow[];
}

const flip = (score: string | null | undefined) => {
  if (!score) return null;
  const m = String(score).match(/^\s*(\d+)\s*[-–:]\s*(\d+)\s*$/);
  return m ? `${m[2]}-${m[1]}` : String(score);
};

export function progressionTable(
  seedOrder: string[],
  games: ProgressionGame[],
  tieBreaks?: readonly string[] | null,
  withdrawn: ReadonlySet<string> = new Set(),
): ProgressionTable {
  const rounds = [...new Set(games.map((g) => Number(g.round) || 1))].sort((a, b) => a - b);
  const decided = (g: ProgressionGame) => (g.a && !g.b) || !!g.winner;

  // Movement compares against the replay up to the last round that is fully decided
  // before the latest round with any result.
  const completeRounds = rounds.filter((r) => games.filter((g) => (Number(g.round) || 1) === r).every(decided));
  const latest = Math.max(0, ...games.filter(decided).map((g) => Number(g.round) || 1));
  const prevRound = [...completeRounds].reverse().find((r) => r < latest) ?? null;

  const order = (upTo: number | null) => {
    const subset = upTo == null ? games : games.filter((g) => (Number(g.round) || 1) <= upTo);
    return swissTable(seedOrder, subset, tieBreaks);
  };
  const current = order(null);
  const prevPos = prevRound != null ? new Map(order(prevRound).map((r) => [r.id, r.position])) : null;

  const rows: ProgressionRow[] = current.map((r) => {
    const cells: ProgressionCell[] = rounds.map((round) => {
      const g = games.find((x) => (Number(x.round) || 1) === round && (x.a === r.id || x.b === r.id));
      if (!g) return { kind: "none" };
      if (g.a === r.id && !g.b) return { kind: "bye" };
      const isA = g.a === r.id;
      const opponent = (isA ? g.b : g.a) as string;
      if (!g.winner) return { kind: "pending", opponent };
      return { kind: "result", opponent, won: g.winner === r.id, score: isA ? g.score ?? null : flip(g.score) };
    });
    const before = prevPos?.get(r.id);
    return {
      id: r.id,
      seed: r.seed,
      position: r.position,
      movement: before == null ? null : before - r.position,
      points: r.points,
      played: r.wins + r.losses - r.byes,
      wins: r.wins,
      losses: r.losses,
      withdrawn: withdrawn.has(r.id),
      cells,
    };
  });

  const active = rows.filter((r) => !r.withdrawn);
  const out = [...active, ...rows.filter((r) => r.withdrawn)];
  return { rounds, positionSwap: isPositionSwap(tieBreaks), rows: out };
}
