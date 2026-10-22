import type { SwissProgressionModel } from "./swiss-progression-view";

export interface FinalRankRow { place: number; id: string; name: string; group: number | null; rrWins: number | null }

/**
 * Display-only final ranking after a Swiss + final-three-round round robin.
 * Each locked group of 4 is re-ordered by its own R3–R5 results (wins, then head-to-head,
 * then locked position); the Swiss remainder keeps its final Swiss order. Null until every round is played.
 */
export function rrFinalRanking(model: SwissProgressionModel): FinalRankRow[] | null {
  const groups = Number(model.rrFinish?.groups ?? 0);
  if (!model.rrFinish?.enabled || groups < 1 || !model.swissStageComplete) return null;
  const base = [...model.rows].filter((r) => r.swissFinalPosition != null).sort((a, b) => (a.swissFinalPosition! - b.swissFinalPosition!));
  if (base.length < groups * 4) return null;
  const games = model.rounds.filter((r) => r.round >= 3).flatMap((r) => r.fixtures).filter((f) => f.a && f.b && f.winner);
  const out: FinalRankRow[] = [];
  for (let g = 0; g < groups; g++) {
    const members = base.slice(g * 4, g * 4 + 4);
    const ids = new Set(members.map((m) => m.id));
    const inGroup = games.filter((f) => ids.has(f.a!) && ids.has(f.b!));
    const wins = new Map(members.map((m) => [m.id, inGroup.filter((f) => f.winner === m.id).length]));
    const beat = (x: string, y: string) => inGroup.some((f) => f.winner === x && (f.a === y || f.b === y));
    const sorted = [...members].sort((x, y) => (wins.get(y.id)! - wins.get(x.id)!) || (beat(x.id, y.id) ? -1 : beat(y.id, x.id) ? 1 : 0) || (x.swissFinalPosition! - y.swissFinalPosition!));
    sorted.forEach((m) => out.push({ place: out.length + 1, id: m.id, name: m.name, group: g + 1, rrWins: wins.get(m.id)! }));
  }
  base.slice(groups * 4).forEach((m) => out.push({ place: out.length + 1, id: m.id, name: m.name, group: null, rrWins: null }));
  return out;
}
