/**
 * Structure page → running tournament: the Swiss round count (and the Riverside "round robin in the
 * final 3 rounds" option) saved on the Structure page are copied into the running tournament's draw
 * copy (builder_spec), so the progression log, standings and automatic next-round games follow the
 * Structure. The Structure value is resolved exactly as the Structure screen shows it — the
 * category's own plan, else its parent, else the tournament default — so a category that inherits
 * the default is synced too. Lowering below a round that already has games, or changing the round
 * robin option once Round 3 exists, is refused for that category (nothing is deleted). Pure.
 */
import { resolveStagePlan, type PlanAnswers } from "./stage-plan";

export interface LiveRoundChange { label: string; from: number | null; to: number }
export interface LiveRoundSync { spec: any; changes: LiveRoundChange[]; blocked: string[] }

const baseLabel = (label: string) => String(label ?? "").split(" · ")[0].trim();
/** "Mens › A · Singles" → "Mens::A" (Structure key). */
const keyOf = (label: string) => baseLabel(label).split(" › ").join("::");
const sameRr = (x: any, y: any) => JSON.stringify(x?.enabled ? { e: true, g: Number(x.groups) } : null) === JSON.stringify(y?.enabled ? { e: true, g: Number(y.groups) } : null);

export function syncSwissRoundsToSpec(spec: any, answers: PlanAnswers | null | undefined,
  createdRoundsByGroup: Record<number, number> = {}): LiveRoundSync {
  const changes: LiveRoundChange[] = []; const blocked: string[] = [];
  if (!spec?.divisions?.length || !answers) return { spec, changes, blocked };
  let touched = false;
  const divisions = spec.divisions.map((d: any) => {
    const key = keyOf(d.label);
    const plan = resolveStagePlan(answers, key).stages[0];
    const stages = [...(d.stages ?? [])];
    const at = stages.findIndex((s: any) => s.order === 0);
    const idx = at >= 0 ? at : 0;
    const st = stages[idx];
    const to = Number(plan?.endAfterRound ?? plan?.rounds);
    if (!st || st.kind !== "swiss" || (plan?.kind && plan.kind !== "swiss") || !Number.isInteger(to) || to < 1) return d;
    const from = Number(st.swissRounds) || null;
    const created = createdRoundsByGroup[Number(d.groupNumber)] ?? 0;
    let next = st;
    if (from !== to) {
      if (to < created) blocked.push(`${key}: Round ${created} already has games, so it can't go down to ${to} rounds.`);
      else { next = { ...next, swissRounds: to }; changes.push({ label: key, from, to }); }
    }
    const rr = plan?.rrFinish?.enabled ? { enabled: true, groups: Number(plan.rrFinish.groups) } : null;
    if (!sameRr(st.rrFinish, rr)) {
      if (created >= 3) blocked.push(`${key}: Round 3 already has games, so the round robin option can't change now.`);
      else { next = { ...next }; if (rr) next.rrFinish = rr; else delete next.rrFinish; }
    }
    if (next === st) return d;
    touched = true;
    stages[idx] = next;
    return { ...d, stages };
  });
  return { spec: touched ? { ...spec, divisions } : spec, changes, blocked };
}
