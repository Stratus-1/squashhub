import { rankUnits, type RankGame, type TieBreakCriterion, type UnitStats } from "./tie-breaks";
import { RR_FINISH_FROM_ROUND, RR_FINISH_ROUNDS, rrFinishSplit } from "./swiss-rr-finish";

/**
 * Live round-robin standings for the Swiss "round robin in final 3 rounds" pilot.
 * Pairing positions are the fixed snapshot after Round 2 (never change); the rank inside each group is
 * recalculated from round-robin games only (Round 3+, both players in the same group, decided).
 * Unplayed games are never counted. Ranking uses the tournament's own tie-break order (rankUnits).
 */
export interface RrStandingMatch { a: string | null; b: string | null; winner: string | null; round: number; status?: string | null; score?: string | null; game_scores?: any }
export interface RrStandingRow extends UnitStats { pairingPosition: number; rank: number; tied: boolean; losses: number }
export interface RrGroupStanding { group: number; positions: [number, number]; rows: RrStandingRow[]; played: number; total: number }

export function rrFinishStandings(input: {
  snapshot: string[]; groups: number; matches: RrStandingMatch[]; criteria: TieBreakCriterion[];
  gameSets: (m: RrStandingMatch) => { sets: Array<{ a: number; b: number }> | null; pointsKnown: boolean };
  fromRound?: number;
}): RrGroupStanding[] {
  const from = input.fromRound ?? RR_FINISH_FROM_ROUND;
  const { groupRanges } = rrFinishSplit(input.snapshot.length, input.groups);
  return groupRanges.map(([lo, hi], gi) => {
    const units = input.snapshot.slice(lo - 1, hi);
    const inGroup = new Set(units);
    const games: RankGame[] = input.matches.flatMap((m) => {
      if (m.round < from || m.round > RR_FINISH_ROUNDS || !m.a || !m.b || !inGroup.has(m.a) || !inGroup.has(m.b) || m.status !== "completed" || (m.winner !== m.a && m.winner !== m.b)) return [];
      return [{ a: m.a, b: m.b, winner: m.winner, ...input.gameSets(m) }];
    });
    const r = rankUnits(units, games, input.criteria);
    const tied = new Set(r.ties.flatMap((t) => t.ids));
    const rows = r.order.flatMap((id, i) => {
      const s = r.stats.get(id);
      if (!s) return [];
      return [{ ...s, losses: s.played - s.wins, pairingPosition: lo + units.indexOf(id), rank: i + 1, tied: tied.has(id) && s.played > 0 }];
    });
    // Equal on everything → share the same rank number.
    for (const t of r.ties) for (const id of t.ids) { const row = rows.find((x) => x.id === id); if (row && row.played > 0) row.rank = t.from; }
    return { group: gi + 1, positions: [lo, hi] as [number, number], rows, played: games.length, total: (units.length * (units.length - 1)) / 2 };
  });
}
