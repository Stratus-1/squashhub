import { resolveStagePlan, stageKindLabel, stageRounds, type PlanAnswers, type StagePlanItem } from "./stage-plan";

/**
 * Display-only capacity estimate for the consolidated Tournament Structure step.
 * Walks each category's ordered stages, carrying the field size forward via each stage's advancement,
 * and counts matches. Undecided stages (or stages lacking rounds) are counted as uncertainty, never guessed.
 */
export interface StageEstimate { label: string; entrants: number; matches: number | null }
export interface UnitCapacity { key: string; entrants: number; stages: StageEstimate[]; matches: number; undecided: number; nextUndecided: number | null }

export function stageMatches(s: StagePlanItem, n: number): number | null {
  if (n < 2 || !s.kind) return null;
  switch (s.kind) {
    case "swiss": { const r = stageRounds(s); return r ? Math.floor(n / 2) * r : null; }
    case "round_robin": return (n * (n - 1)) / 2;
    case "pools": {
      const p = Math.max(1, Math.min(s.pools ?? Math.max(1, Math.round(n / 4)), Math.floor(n / 2)));
      let total = 0;
      for (let i = 0; i < p; i++) { const size = Math.floor(n / p) + (i < n % p ? 1 : 0); total += (size * (size - 1)) / 2; }
      return total;
    }
    case "knockout": return n - 1;
    case "placement": return Math.floor(n / 2);
    case "cross_league": return Math.floor(n / 2);
  }
}

function nextField(s: StagePlanItem, n: number): number {
  const a = s.advance;
  if (!a || a.mode === "all_continue") return n;
  if (a.mode === "top_n" || a.mode === "shared_playoff") return Math.min(n, a.topN ?? n);
  if (a.mode === "per_pool") return Math.min(n, (a.perPool ?? 1) * (s.pools ?? 1));
  return 0;
}

export function unitCapacity(a: PlanAnswers, key: string, entrants: number): UnitCapacity {
  const { stages } = resolveStagePlan(a, key);
  let n = entrants, matches = 0, undecided = 0, nextUndecided: number | null = null;
  const out: StageEstimate[] = stages.map((s, i) => {
    const m = stageMatches(s, n);
    if (m == null) { undecided++; if (nextUndecided == null) nextUndecided = i; } else matches += m;
    const est = { label: `${stageKindLabel(s.kind)}${s.kind === "swiss" && stageRounds(s) ? ` ${stageRounds(s)}` : ""}`, entrants: n, matches: m };
    n = nextField(s, n);
    return est;
  });
  return { key, entrants, stages: out, matches, undecided, nextUndecided };
}

/** Court-hours needed vs available. Available is null when courts/dates aren't chosen yet. */
export function courtLoad(matches: number, matchMinutes: number, available?: { courts: number; sessions: number; sessionMinutes: number } | null) {
  const needMin = matches * matchMinutes;
  const availMin = available && available.courts > 0 && available.sessions > 0 ? available.courts * available.sessions * available.sessionMinutes : null;
  return { needHours: Math.round(needMin / 6) / 10, availHours: availMin == null ? null : Math.round(availMin / 6) / 10, fits: availMin == null ? null : needMin <= availMin };
}
