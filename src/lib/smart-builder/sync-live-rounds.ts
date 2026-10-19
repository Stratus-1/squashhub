/**
 * Structure page → running tournament: Swiss round counts saved on the Structure page are copied
 * into the running tournament's draw copy (builder_spec), so the progress log, standings and
 * automatic next-round games follow the Structure. Lowering below a round that already has games
 * is refused for that category (nothing is deleted). Pure — the caller writes the result.
 */
export interface LiveRoundChange { label: string; from: number | null; to: number }
export interface LiveRoundSync { spec: any; changes: LiveRoundChange[]; blocked: string[] }

const baseLabel = (label: string) => String(label ?? "").split(" · ")[0].trim();

export function syncSwissRoundsToSpec(spec: any, stagePlans: Record<string, any[] | undefined> | null | undefined,
  createdRoundsByGroup: Record<number, number> = {}): LiveRoundSync {
  const changes: LiveRoundChange[] = []; const blocked: string[] = [];
  if (!spec?.divisions?.length || !stagePlans) return { spec, changes, blocked };
  const divisions = spec.divisions.map((d: any) => {
    const key = baseLabel(d.label);
    const plan = stagePlans[key]?.[0];
    const stages = [...(d.stages ?? [])];
    const idx = stages.findIndex((s: any) => s.order === 0) >= 0 ? stages.findIndex((s: any) => s.order === 0) : 0;
    const st = stages[idx];
    const to = Number(plan?.rounds);
    if (!st || st.kind !== "swiss" || plan?.kind && plan.kind !== "swiss" || !Number.isInteger(to) || to < 1) return d;
    const from = Number(st.swissRounds) || null;
    if (from === to) return d;
    const created = createdRoundsByGroup[Number(d.groupNumber)] ?? 0;
    if (to < created) { blocked.push(`${key}: Round ${created} already has games, so it can't go down to ${to} rounds.`); return d; }
    stages[idx] = { ...st, swissRounds: to };
    changes.push({ label: key, from, to });
    return { ...d, stages };
  });
  return { spec: changes.length ? { ...spec, divisions } : spec, changes, blocked };
}
