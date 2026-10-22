import blossom from "edmonds-blossom";
import { IntegrityError } from "./contract";

export interface SequencingPlayer { id: string; points: number; seed: number; byes?: number }
export const swissOpponentKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;

/** Current ranking only. No future identities are simulated or persisted. Blossom finds a
 * complete maximum-weight legal matching, not a greedy choice that can strand a player.
 * Earlier rounds minimize score floats before preserving today's adjacent opportunities.
 * Final rounds maximize adjacent pairs, then minimize total rank distance. */
export function sequenceSwissRound(input: {
  players: SequencingPlayer[]; played: ReadonlySet<string>; round: number; finalRound: number;
  positionOffset?: number;
}): { pairs: Array<[string, string | null]>; exceptions: string[] } {
  const { players, played, round, finalRound } = input;
  if (!Number.isInteger(round) || !Number.isInteger(finalRound) || round < 1 || finalRound < round)
    throw new IntegrityError("swiss_round", "Swiss sequencing needs a valid current and final round.");
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new IntegrityError("swiss_field", "Duplicate Swiss entrants.");
  if (!players.length) return { pairs: [], exceptions: [] };
  const n = players.length, final = round === finalRound;
  const odd = n % 2 === 1, vertices = n + Number(odd);
  const adjacent = (i: number, j: number) => Math.floor(i / 2) === Math.floor(j / 2);
  // Integer lexicographic weights: a higher objective outweighs every lower objective
  // across the entire matching. Byes first: fewest prior byes, then lowest rank.
  const rankUnit = n * n + 1;
  const adjacencyUnit = rankUnit * (n + 1);
  const scoreUnit = adjacencyUnit * (n + 1);
  const maxPoints = Math.max(0, ...players.map((p) => p.points));
  const byeRankUnit = scoreUnit * (maxPoints * n + n + 1);
  const byeCountUnit = byeRankUnit * (n + 1);
  const edges: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (played.has(swissOpponentKey(players[i].id, players[j].id))) continue;
      const distance = j - i;
      const scoreGap = Math.abs(players[i].points - players[j].points);
      const cost = final
        ? Number(!adjacent(i, j)) * adjacencyUnit + distance * rankUnit
        : scoreGap * scoreUnit + Number(adjacent(i, j)) * adjacencyUnit + distance * rankUnit;
      edges.push([i, j, -cost]);
    }
    if (odd) edges.push([i, n, -((players[i].byes ?? 0) * byeCountUnit + (n - 1 - i) * byeRankUnit)]);
  }
  let mates = blossom(edges, true);
  if (Array.from({ length: vertices }, (_, i) => mates[i]).some((j) => j == null || j < 0))
    throw new IntegrityError("swiss_repeat", `Round ${round}: no complete pairing without repeat opponents exists. Saved games remain unchanged.`);
  // Exact bounded opportunity lookahead for small even cohorts: choose among equally fair
  // current draws only. Check edge-disjoint continuation, not imaginary future results.
  // The final hypothetical matching rewards TODAY'S adjacency; actual ranks are recomputed later.
  if (!final && !odd && n <= 8 && finalRound - round <= 2) {
    const legal = new Map(edges.map(([i,j,w]) => [`${i}:${j}`, -w]));
    const enumerate = (blocked: ReadonlySet<string>, visit: (pairs: Array<[number,number]>) => void) => {
      const walk = (free: number[], pairs: Array<[number,number]>) => {
        if (!free.length) { visit(pairs); return; }
        const [i,...rest] = free;
        for (const j of rest) if (legal.has(`${i}:${j}`) && !blocked.has(`${i}:${j}`))
          walk(rest.filter((k) => k !== j), [...pairs,[i,j]]);
      };
      walk(Array.from({length:n},(_,i)=>i),[]);
    };
    const cache = new Map<string, number>();
    const opportunity = (blocked: Set<string>, roundsLeft: number): number => {
      const cacheKey = `${roundsLeft}/${[...blocked].sort().join(",")}`;
      const cached = cache.get(cacheKey); if (cached !== undefined) return cached;
      let best = -1;
      enumerate(blocked, (pairs) => {
        const value = roundsLeft === 1 ? pairs.filter(([i,j])=>adjacent(i,j)).length
          : opportunity(new Set([...blocked,...pairs.map(([i,j])=>`${i}:${j}`)]),roundsLeft-1);
        best=Math.max(best,value);
      });
      cache.set(cacheKey,best); return best;
    };
    const scoreGap = (pairs: Array<[number,number]>) => pairs.reduce((s,[i,j])=>s+Math.abs(players[i].points-players[j].points),0);
    const current = mates.flatMap((j,i): Array<[number,number]> => i<j?[[i,j]]:[]);
    const fairness = scoreGap(current);
    let bestOpportunity=-1, bestCost=Infinity;
    enumerate(new Set(), (pairs) => {
      if (scoreGap(pairs)!==fairness) return;
      const future=opportunity(new Set(pairs.map(([i,j])=>`${i}:${j}`)),finalRound-round);
      const cost=pairs.reduce((s,[i,j])=>s+(legal.get(`${i}:${j}`)??0),0);
      if (future<bestOpportunity || (future===bestOpportunity && cost>=bestCost)) return;
      bestOpportunity=future; bestCost=cost;
      mates=Array(n).fill(-1); pairs.forEach(([i,j])=>{mates[i]=j;mates[j]=i;});
    });
  }
  const pairs: Array<[string, string | null]> = [];
  for (let i = 0; i < n; i++) {
    const j = mates[i];
    if (j === n) pairs.push([players[i].id, null]);
    else if (i < j) pairs.push([players[i].id, players[j].id]);
  }
  const exceptions: string[] = [];
  if (final) for (let i = 0; i + 1 < n; i += 2) {
    if (mates[i] === i + 1) continue;
    const lo = i + 1 + (input.positionOffset ?? 0);
    const reason = played.has(swissOpponentKey(players[i].id, players[i + 1].id))
      ? "these players already met" : "a complete legal draw or a fair bye requires another opponent";
    exceptions.push(`Round ${round}: ${lo} v ${lo + 1} unavailable — ${reason}; closest legal alternatives used.`);
  }
  return { pairs, exceptions };
}