/**
 * Step-by-Step Beta: optional pools INSIDE a category/subcategory.
 *
 * Setup only stores the rule (No pools / Create automatically with a preferred size / Decide after entries
 * close). Real pools are proposed from the ACTUAL entrants at Generate draw & fixtures, where the organiser
 * reviews, accepts or adjusts them. Pools never become subcategories and never change within/between logic.
 * Pure: no IO.
 */

export type PoolMode = "none" | "auto" | "later";
export interface PoolPlan {
  mode: PoolMode;
  /** Preferred pool size — a preference, not a threshold. */
  target?: string;
  /** Play-offs: how many from each pool qualify. Empty = derived from the play-off size. */
  perPool?: string;
  /** Play-offs: extra best runners-up across pools (not yet mappable by the engine). */
  runnersUp?: string;
}

export const POOL_MODE_LABEL: Record<PoolMode, string> = {
  none: "No pools",
  auto: "Create pools automatically",
  later: "Decide after entries close",
};

/** A round robin bigger than this is worth a warning (n·(n−1)/2 games). */
export const LARGE_ROUND_ROBIN = 10;
/** Pools smaller than this are avoided when a more balanced split exists. */
const MIN_POOL = 3;

/** Balanced sizes, biggest first: 18 into 4 → [5,5,4,4]. */
export function balancedSizes(n: number, pools: number): number[] {
  const k = Math.max(1, Math.min(pools, n || 1));
  const base = Math.floor(n / k), extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Recommended pools for n entrants and a preferred size: the count whose average is closest to the preferred
 * size, never leaving a pool below 3 when fewer pools avoid it. 10/5 → [5,5]; 18/5 → [5,5,4,4]; 7/5 → [7].
 */
export function recommendPools(n: number, target: number): number[] {
  if (!n || n < 1) return [];
  const t = Math.max(2, Math.floor(target) || 2);
  let k = Math.max(1, Math.round(n / t));
  while (k > 1 && Math.floor(n / k) < Math.min(MIN_POOL, t)) k--;
  return balancedSizes(n, k);
}

export const poolPlanOf = (plan: Record<string, any> | null | undefined, key: string): PoolPlan | null =>
  (plan?.poolPlan?.[key] ?? plan?.poolPlan?.[key.split("::")[0]] ?? null) as PoolPlan | null;

export const sizesText = (s: number[]) => s.join(", ");

export interface PoolReview {
  mode: PoolMode;
  /** Recommended split from the actual entrants (empty when mode is "none" or not computable). */
  recommended: number[];
  /** Plain-language line for the review, e.g. "Men's A has 18 entrants. Recommended: 4 pools — 5, 5, 4, 4." */
  line: string;
  /** Must be accepted by the organiser before generating ("Decide after entries close"). */
  needsDecision: boolean;
  warnings: string[];
}

/** What the draw review shows for one category/subcategory given its pool rule and actual entrants. */
export function reviewPools(rule: PoolPlan | null, label: string, n: number, unit: string): PoolReview {
  const mode: PoolMode = rule?.mode ?? "none";
  const warnings: string[] = [];
  if (mode === "none") {
    if (n > LARGE_ROUND_ROBIN) warnings.push(`${label} has ${n} ${unit}s in one round robin (${(n * (n - 1)) / 2} games). Consider splitting it into pools — your "No pools" choice is kept unless you change it.`);
    return { mode, recommended: [], line: "", needsDecision: false, warnings };
  }
  const target = Number(rule?.target) || 5;
  const rec = recommendPools(n, target);
  const line = !n ? `${label} has no ${unit}s yet.`
    : rec.length <= 1 ? `${label} has ${n} ${unit}${n === 1 ? "" : "s"}. Recommended: one group (too few for more than one pool of about ${target}).`
    : `${label} has ${n} ${unit}s. Recommended: ${rec.length} pools — ${sizesText(rec)}.`;
  return { mode, recommended: rec, line, needsDecision: mode === "later", warnings };
}
