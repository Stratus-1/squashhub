import type { OverallRow } from "./overall-standings";

export interface PoolFinish {
  id: string;
  gameDiff: number;
  pointsDiff: number;
}
export interface PlacementResult {
  stage: string;
  label: string | null;
  status: string;
  a: string | null;
  b: string | null;
  winner: string | null;
}

/** Read-only two-pool, top-four crossover finish. Pool rows must be in saved standings order. */
export function twoPoolFinalRanking(pools: PoolFinish[][], results: PlacementResult[]): OverallRow[] | null {
  if (pools.length !== 2 || pools.some(p => p.length < 4)) return null;
  const all = pools.flat();
  const ids = new Set(all.map(p => p.id));
  if (ids.size !== all.length) return null;
  const match = (label: string) => {
    const found = results.filter(r => r.label === label);
    if (found.length !== 1) return null;
    const r = found[0];
    return r.status === "completed" && r.a && r.b && r.a !== r.b && ids.has(r.a) && ids.has(r.b) &&
      (r.winner === r.a || r.winner === r.b) ? r : null;
  };
  const sf1 = match("Semifinal 1"), sf2 = match("Semifinal 2");
  const sf3 = match("Semifinal 3 (5th–8th)"), sf4 = match("Semifinal 4 (5th–8th)");
  const final = match("Final"), plate = match("5th place final");
  if (!sf1 || !sf2 || !sf3 || !sf4 || !final || !plate) return null;
  const loser = (r: PlacementResult) => r.winner === r.a ? r.b : r.a;
  const feeds = (r: PlacementResult, x: PlacementResult, y: PlacementResult) =>
    x.winner !== y.winner && [r.a, r.b].includes(x.winner) && [r.a, r.b].includes(y.winner);
  if (!feeds(final, sf1, sf2) || !feeds(plate, sf3, sf4)) return null;
  const stats = new Map(all.map(p => [p.id, p]));
  const compare = (a: string, b: string) => {
    const x = stats.get(a), y = stats.get(b);
    return x && y ? (y.gameDiff - x.gameDiff) || (y.pointsDiff - x.pointsDiff) : 0;
  };
  const rows: OverallRow[] = [];
  const add = (id: string | null, how: string) => {
    if (id) rows.push({ id, place: rows.length + 1, how });
  };
  const pair = (a: string | null, b: string | null, how: string) => {
    const members = [a, b].filter((id): id is string => !!id).sort(compare);
    const place = rows.length + 1;
    const tied = members.length === 2 && compare(members[0], members[1]) === 0;
    for (const id of members) rows.push({ id, place: tied ? place : rows.length + 1, how: tied ? `${how} · tied` : how });
  };
  add(final.winner, "Final winner"); add(loser(final), "Final runner-up");
  pair(loser(sf1), loser(sf2), "Main semifinal · pool tie-break");
  add(plate.winner, "5th-place final winner"); add(loser(plate), "5th-place final runner-up");
  pair(loser(sf3), loser(sf4), "Plate semifinal · pool tie-break");
  const placed = new Set(rows.map(r => r.id));
  if (placed.size !== 8 || pools.some(p => p.slice(0, 4).some(r => !placed.has(r.id)))) return null;
  for (let i = 4; i < Math.max(...pools.map(p => p.length)); i++) {
    pair(pools[0][i]?.id ?? null, pools[1][i]?.id ?? null, `Pool position ${i + 1} · pool tie-break`);
  }
  return rows.length === all.length && new Set(rows.map(r => r.id)).size === all.length ? rows : null;
}