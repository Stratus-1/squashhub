import { resolveStagePlan, stageRounds, type PlanAnswers } from "./stage-plan";

/**
 * Stages & scheduling verification (Riverside pilot): the Tournament Structure decides how many main
 * rounds EACH category needs; the organiser adds rounds by hand. This only checks — it never creates or
 * deletes rounds, fixtures or results. A round set to "All categories" counts for every category, a
 * round set to a category counts for all its subcategories.
 */
export interface RoundStageLike { unit: string; phase?: string; mode?: string; date?: string; deadline?: string }
export interface RoundCountResult { key: string; label: string; required: number; created: number; dated: number; rrFinish: boolean; problem: string | null }

export const stageAppliesTo = (s: RoundStageLike, key: string) =>
  !s.unit || s.unit === key || (key.includes("::") && s.unit === key.split("::")[0]);

export function roundCountCheck(answers: PlanAnswers, units: Array<{ key: string; base: string }>, stages: RoundStageLike[]): RoundCountResult[] {
  return units.flatMap((u) => {
    const first = resolveStagePlan(answers, u.key).stages[0] as any;
    const required = first?.kind === "swiss" ? stageRounds(first) : null;
    if (!required) return [];
    const mine = stages.filter((s) => (s.phase ?? "main") !== "playoff" && stageAppliesTo(s, u.key));
    const created = mine.length;
    const dated = mine.filter((s) => (s.mode === "play_by" ? !!s.deadline : s.mode === "scheduled" ? !!s.date : false)).length;
    const rrFinish = !!first?.rrFinish?.enabled;
    const label = u.base.replace(/::/g, " › ");
    let problem: string | null = null;
    if (created < required) {
      const missing = Array.from({ length: required - created }, (_, i) => `Round ${created + i + 1}`).join(", ");
      problem = `${label}: ${created} of ${required} rounds created; add ${missing}.${rrFinish ? " Rounds 3–5 are the group round robin." : ""}`;
    } else if (created > required) {
      problem = `${label}: ${created} rounds created but the Tournament Structure needs ${required}; remove ${created - required} or change the Structure.`;
    }
    return [{ key: u.key, label, required, created, dated, rrFinish, problem }];
  });
}
