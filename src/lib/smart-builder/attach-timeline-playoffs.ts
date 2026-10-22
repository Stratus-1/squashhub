import { commitStructured, supabaseDb } from "@/lib/tournaments/structured-db";
import { atomically } from "@/lib/tournaments/structured-persist";
import type { TournamentSpec } from "@/lib/tournaments/engine-service";
import { attachPlannedPlayoffs } from "./step-draw";

/**
 * Timeline play-offs default to starting automatically once their source stage is decided: the organiser
 * already fixed the stage, its pairing and its dates. An explicit "confirm" choice is kept.
 */
export function withAutoTimelinePlayoffs<T extends { stages?: any[] } | null>(plan: T): T {
  if (!plan?.stages) return plan;
  return { ...plan, stages: plan.stages.map((s: any) => (s?.phase === "playoff" && !s.start ? { ...s, start: "auto" } : s)) };
}

/**
 * Pure: the spec with timeline play-offs appended only to categories that planned them and have no later
 * stage yet. Existing stages are returned unchanged (structured_commit enforces this append-only rule).
 */
export function timelinePlayoffSpec(spec: TournamentSpec | null | undefined, plan: any): TournamentSpec | null {
  if (!spec || !plan) return null;
  return attachPlannedPlayoffs(spec, withAutoTimelinePlayoffs(plan), { explicitOnly: true });
}

/** Explicit organiser save → attach planned play-offs to an already-generated structured tournament. */
export async function attachTimelinePlayoffs(tid: string, plan: any): Promise<boolean> {
  let attached = false;
  await atomically(supabaseDb, tid, commitStructured, async (tx) => {
    const [t] = await tx.select("tournaments", { id: tid });
    if (!t || t.builder_architecture !== "structured") return;
    const next = timelinePlayoffSpec(t.builder_spec as TournamentSpec, plan);
    if (next) { await tx.update("tournaments", { id: tid }, { builder_spec: next }); attached = true; }
  });
  return attached;
}
