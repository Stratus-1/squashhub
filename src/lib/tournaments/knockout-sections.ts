/**
 * Knockout section (pool) SIZING.
 *
 * Round robin / Swiss / cross-league pools want equal headcount — sizes that
 * differ by at most one entrant. A knockout draw does not: what matters there
 * is the BRACKET, and a bracket only fits neatly when the section holds a
 * power of two (4, 8, 16, 32). A 14-entrant division split 7 + 7 produces two
 * 8-brackets with one bye each; split 8 + 6 the first section needs no byes at
 * all and only the second carries them.
 *
 * Heuristic (greedy, strongest section first):
 *   For each section, with `remaining` entrants and `left` sections to fill:
 *     - the last section simply takes whatever remains;
 *     - otherwise pick the power of two P with MIN_SECTION <= P <= remaining -
 *       MIN_SECTION * (left - 1) that is closest to the running average
 *       (remaining / left); ties go to the LARGER power of two;
 *     - if no power of two fits, fall back to ceil(average) clamped into the
 *       feasible range.
 *   Sizes are returned largest-first, so section A is the "full" bracket.
 *
 * Worked examples (the ones the organisers hit in practice):
 *   14 / 2 -> 8 + 6      22 / 3 -> 8 + 8 + 6      30 / 4 -> 8 + 8 + 8 + 6
 *   16 / 2 -> 8 + 8      32 / 4 -> 8 + 8 + 8 + 8  12 / 2 -> 8 + 4
 *
 * Degenerate inputs (fewer entrants than sections * MIN_SECTION) fall back to
 * the balanced split so nothing ever ends up with a zero-entrant section that
 * could have held someone.
 */

/** Smallest section we will deliberately create. */
export const MIN_SECTION = 2;

/** Next power of two at or above n (bracket size). */
export function bracketSize(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(1, p);
}

/** Byes a section of `n` entrants needs in its first round. */
export function byesFor(n: number): number {
  return n <= 1 ? 0 : bracketSize(n) - n;
}

/** Balanced split — sizes differ by at most one (non-knockout behaviour). */
export function balancedSectionSizes(total: number, sections: number): number[] {
  const n = Math.max(1, Math.floor(sections) || 1);
  const t = Math.max(0, Math.floor(total) || 0);
  const base = Math.floor(t / n);
  const extra = t % n;
  // Match the serpentine deal, which fills the LAST pools first on the return
  // leg: sizes ascend so the tail pools carry the spare entrant.
  return Array.from({ length: n }, (_, i) => base + (i >= n - extra ? 1 : 0));
}

/** Power-of-two candidates within [MIN_SECTION, max]. */
function powersUpTo(max: number): number[] {
  const out: number[] = [];
  for (let p = MIN_SECTION; p <= max; p *= 2) out.push(p);
  return out;
}

/**
 * Bracket-optimised section sizes for a knockout division, largest first.
 * Always sums to `total`.
 */
export function knockoutSectionSizes(total: number, sections: number): number[] {
  const n = Math.max(1, Math.floor(sections) || 1);
  const t = Math.max(0, Math.floor(total) || 0);
  if (n === 1) return [t];
  if (t < n * MIN_SECTION) return balancedSectionSizes(t, n);

  const sizes: number[] = [];
  let remaining = t;
  for (let i = 0; i < n; i++) {
    const left = n - i;
    if (left === 1) {
      sizes.push(remaining);
      break;
    }
    const avg = remaining / left;
    const max = remaining - MIN_SECTION * (left - 1);
    const candidates = powersUpTo(max);
    let pick: number;
    if (candidates.length > 0) {
      pick = candidates.reduce((best, p) => {
        const d = Math.abs(p - avg);
        const bd = Math.abs(best - avg);
        // Ties prefer the larger power of two: a full bracket up front.
        return d < bd || (d === bd && p > best) ? p : best;
      }, candidates[0]);
    } else {
      pick = Math.min(max, Math.max(MIN_SECTION, Math.ceil(avg)));
    }
    sizes.push(pick);
    remaining -= pick;
  }
  return sizes.sort((a, b) => b - a);
}

/** Total first-round byes implied by a set of section sizes. */
export function totalByes(sizes: number[]): number {
  return sizes.reduce((sum, n) => sum + byesFor(n), 0);
}

/** "8 + 6" — for the allocation UI summary. */
export function describeSectionSizes(sizes: number[]): string {
  return sizes.join(" + ");
}
