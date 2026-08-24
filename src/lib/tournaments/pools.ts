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
 *
 * Knockout divisions use the SAME equal split (14 -> 7 + 7, 11 -> 6 + 5).
 * An odd pool simply means the top-ranked seed of that pool sits out the
 * opening knockout round (a bye) — see `buildSectionFirstRound`.
 */
export function poolSizes(total: number, pools: number, _opts?: PoolAssignOptions): number[] {
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
export function blockPoolIndex(i: number, pools: number, total: number, opts?: PoolAssignOptions): number {
  if (pools <= 1) return 0;
  const sizes = poolSizes(total, pools, opts);
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
  /**
   * Knockout draw: size the pools for the bracket (powers of two first, e.g.
   * 14 -> 8 + 6) instead of equal headcount. Ignored by every other format.
   */
  knockout?: boolean;
}

/** Pool index per row, aligned with the given (already ordered) list. */
export function poolIndexes(total: number, pools: number, opts?: PoolAssignOptions): number[] {
  const n = Math.max(1, Math.floor(pools) || 1);
  if (opts?.manual) {
    return Array.from({ length: total }, (_, i) => blockPoolIndex(i, n, total, opts));
  }
  if (n <= 1) return new Array(total).fill(0);
  // Serpentine deal, but never beyond a pool's target capacity: for knockout
  // those capacities are the bracket-optimised sizes, for everything else they
  // are exactly what a plain snake produces (so behaviour is unchanged).
  const capacity = poolSizes(total, n, opts);
  const used = new Array(n).fill(0);
  const out: number[] = [];
  for (let i = 0; i < total; i++) {
    const round = Math.floor(i / n);
    const forward = round % 2 === 0;
    let p = snakePoolIndex(i, n);
    // Walk on in the direction of this leg until a pool still has room.
    for (let step = 0; step < n; step++) {
      const cand = forward ? (p + step) % n : (p - step + n * 2) % n;
      if (used[cand] < capacity[cand]) {
        p = cand;
        break;
      }
    }
    used[p] += 1;
    out.push(p);
  }
  return out;
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

/**
 * Reorder the VISUAL (pool-block) list after a drag.
 *
 * Pool membership is positional: pool sizes are fixed by `poolSizes`, so a
 * plain array-move across a pool boundary silently pushes a different entrant
 * out of the target pool ("someone disappeared"). Crossing pools therefore
 * SWAPS the dragged row with the row it was dropped on — both pools keep their
 * size and the displacement is exactly what the organiser can see.
 * Dragging inside one pool keeps the normal insert-and-shift behaviour.
 */
export function reorderVisual(
  visualIds: string[],
  activeId: string,
  overId: string,
  pools: number,
  opts?: PoolAssignOptions,
): string[] {
  const from = visualIds.indexOf(activeId);
  const to = visualIds.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return visualIds;
  const idx = poolIndexes(visualIds.length, Math.max(1, Math.floor(pools) || 1), { ...opts, manual: true });
  const next = [...visualIds];
  if (idx[from] !== idx[to]) {
    next[from] = visualIds[to];
    next[to] = visualIds[from];
    return next;
  }
  next.splice(from, 1);
  next.splice(to, 0, visualIds[from]);
  return next;
}
