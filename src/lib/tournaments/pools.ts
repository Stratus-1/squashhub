/**
 * Seeded pool (section) distribution for a tournament division.
 *
 * The input is ALWAYS an already seed-ordered entrant list — see
 * `sortDivisionEntrants` in `./seeding.ts` (club ladder ascending, unranked
 * last). This module only decides WHICH pool each seed lands in.
 *
 * Algorithm: serpentine / snake traversal. Seeds are dealt across the pools
 * left→right, then right→left, then left→right again:
 *
 *   2 pools, 8 seeds -> A: 1,4,5,8   B: 2,3,6,7
 *   2 pools, 9 seeds -> A: 1,4,5,8,9 B: 2,3,6,7
 *
 * This keeps aggregate pool strength as level as possible instead of dumping
 * the strongest entrants into Pool A (a contiguous chunk split).
 *
 * Unranked entrants are never given an invented rank; because they already
 * sort after every ranked entrant, continuing the same serpentine sequence
 * spreads them as evenly as the counts allow.
 *
 * Manual organiser arrangements are preserved: when a division has been
 * hand-arranged the caller passes `manual: true` and the list is split into
 * contiguous blocks in exactly the order the organiser left it. Automatic
 * serpentine allocation only returns via an explicit rebalance action.
 */

/** Pool index (0-based) for the i-th seed in a serpentine deal. */
export function snakePoolIndex(i: number, pools: number): number {
  if (pools <= 1) return 0;
  const round = Math.floor(i / pools);
  const pos = i % pools;
  return round % 2 === 0 ? pos : pools - 1 - pos;
}

/**
 * Balanced pool sizes for `total` entrants — identical to the sizes the
 * serpentine deal produces, so a seeded layout can be "materialised" into a
 * plain ordered list (pool A's rows, then pool B's rows, …) without the pool
 * sizes changing. Differs by at most one entrant between pools.
 */
export function poolSizes(total: number, pools: number): number[] {
  const n = Math.max(1, Math.floor(pools) || 1);
  const sizes = new Array(n).fill(0);
  for (let i = 0; i < total; i++) sizes[snakePoolIndex(i, n)] += 1;
  return sizes;
}

/**
 * Pool index for the i-th row of a contiguous/block split (manual mode).
 * Blocks follow `poolSizes`, so a manual list reads top-to-bottom as
 * pool A, then pool B, … with balanced sizes.
 */
export function blockPoolIndex(i: number, pools: number, total: number): number {
  if (pools <= 1) return 0;
  const sizes = poolSizes(total, pools);
  let acc = 0;
  for (let p = 0; p < sizes.length; p++) {
    acc += sizes[p];
    if (i < acc) return p;
  }
  return sizes.length - 1;
}

export interface PoolAssignOptions {
  /** The organiser hand-arranged this division — keep their order, block-split. */
  manual?: boolean;
}

/** Pool index per row, aligned with the given (already ordered) list. */
export function poolIndexes(total: number, pools: number, opts?: PoolAssignOptions): number[] {
  const n = Math.max(1, Math.floor(pools) || 1);
  return Array.from({ length: total }, (_, i) =>
    opts?.manual ? blockPoolIndex(i, n, total) : snakePoolIndex(i, n),
  );
}

/** Group an ordered entrant list into pools, preserving seed order inside each. */
export function distributeIntoPools<T>(ordered: T[], pools: number, opts?: PoolAssignOptions): T[][] {
  const n = Math.max(1, Math.floor(pools) || 1);
  const out: T[][] = Array.from({ length: n }, () => []);
  const idx = poolIndexes(ordered.length, n, opts);
  ordered.forEach((item, i) => out[idx[i]].push(item));
  return out;
}

/** Entrant count per pool. */
export function poolCounts(total: number, pools: number, opts?: PoolAssignOptions): number[] {
  const n = Math.max(1, Math.floor(pools) || 1);
  const counts = new Array(n).fill(0);
  poolIndexes(total, n, opts).forEach((p) => (counts[p] += 1));
  return counts;
}

/** A, B, C … */
export function poolLetter(p: number): string {
  return String.fromCharCode(65 + p);
}

/**
 * The ordered list as the organiser SEES it: pool A's entrants, then pool B's,
 * and so on. Dragging works in this visual space; writing this order back as
 * the division's manual order reproduces exactly the same pool membership
 * (block split and serpentine share `poolSizes`).
 */
export function flattenPools<T>(ordered: T[], pools: number, opts?: PoolAssignOptions): T[] {
  const n = Math.max(1, Math.floor(pools) || 1);
  if (n <= 1) return [...ordered];
  return distributeIntoPools(ordered, n, opts).flat();
}

export interface PoolBlockRow<T> {
  item: T;
  /** 1-based seed within the DIVISION (position in the seeded order). */
  seed: number;
}

export interface PoolBlock<T> {
  /** 0-based pool index. */
  pool: number;
  /** A, B, C … */
  letter: string;
  rows: PoolBlockRow<T>[];
}

/**
 * Pools as separate, renderable blocks — never one interleaved list.
 * Each row keeps its division seed number so the organiser can still read
 * "Pool A: 1, 4, 5, 8, 9" at a glance.
 */
export function poolBlocks<T>(ordered: T[], pools: number, opts?: PoolAssignOptions): PoolBlock<T>[] {
  const n = Math.max(1, Math.floor(pools) || 1);
  const idx = poolIndexes(ordered.length, n, opts);
  const out: PoolBlock<T>[] = Array.from({ length: n }, (_, p) => ({
    pool: p,
    letter: poolLetter(p),
    rows: [],
  }));
  ordered.forEach((item, i) => out[idx[i]].rows.push({ item, seed: i + 1 }));
  return out;
}
