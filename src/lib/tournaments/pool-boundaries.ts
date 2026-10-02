/**
 * Pool boundaries: during pool play each pool is an independent round robin.
 * A pool fixture may only pair two entrants of the SAME pool, and each pool must hold exactly
 * n·(n−1)/2 games per leg. Cross-pool meetings belong to a later, explicitly configured stage.
 * Pure: no IO.
 */
export interface PoolFixtureLike { a: string | null; b: string | null; poolIndex: number | null }

/** Single round robin game count for n entrants. */
export const rrGames = (n: number) => (n * (n - 1)) / 2;

/** Problems with a pool assignment itself: empty pools, entrants in two pools, missing or unknown entrants. */
export function poolAssignmentIssues(pools: string[][] | null | undefined, entrantIds: string[], unit = "entrant"): string[] {
  if (!pools || !pools.length) return ["pool assignments are not resolved yet — review and accept the pools"];
  const out: string[] = [];
  const seen = new Map<string, number>();
  pools.forEach((p, i) => p.forEach((id) => {
    if (seen.has(id)) out.push(`a ${unit} is in both Pool ${String.fromCharCode(65 + seen.get(id)!)} and Pool ${String.fromCharCode(65 + i)} — each must be in exactly one pool`);
    else seen.set(id, i);
  }));
  const ids = new Set(entrantIds);
  const missing = entrantIds.filter((id) => !seen.has(id)).length;
  if (missing) out.push(`${missing} ${unit}${missing === 1 ? " is" : "s are"} not in any pool — place them or reset the pools`);
  const unknown = [...seen.keys()].filter((id) => !ids.has(id)).length;
  if (unknown) out.push(`${unknown} pool place${unknown === 1 ? " holds" : "s hold"} a ${unit} who is no longer entered — refresh the pools`);
  pools.forEach((p, i) => { if (p.length < 2) out.push(`Pool ${String.fromCharCode(65 + i)} has ${p.length} ${unit}${p.length === 1 ? "" : "s"} — a pool needs at least 2`); });
  return out;
}

/** Problems with generated pool fixtures: cross-pool pairings and wrong per-pool counts. */
export function poolFixtureIssues(pools: string[][], fixtures: PoolFixtureLike[], legs = 1): string[] {
  const out: string[] = [];
  const poolOf = new Map<string, number>();
  pools.forEach((p, i) => p.forEach((id) => poolOf.set(id, i)));
  let cross = 0;
  const counts = pools.map(() => 0);
  for (const f of fixtures) {
    if (!f.a || !f.b) continue;
    const pa = poolOf.get(f.a), pb = poolOf.get(f.b);
    if (pa == null || pb == null || pa !== pb || (f.poolIndex != null && f.poolIndex !== pa)) { cross++; continue; }
    counts[pa]++;
  }
  if (cross) out.push(`${cross} pool game${cross === 1 ? "" : "s"} would pair entrants from different pools`);
  pools.forEach((p, i) => {
    const want = rrGames(p.length) * legs;
    if (counts[i] !== want) out.push(`Pool ${String.fromCharCode(65 + i)} (${p.length}) has ${counts[i]} games, expected ${want}`);
  });
  return out;
}
