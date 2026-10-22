import { commitStructured, supabaseDb } from "@/lib/tournaments/structured-db";
import { atomically } from "@/lib/tournaments/structured-persist";
import type { TournamentSpec } from "@/lib/tournaments/engine-service";
import { attachPlannedPlayoffs } from "./step-draw";
import { persistStructure } from "@/lib/tournaments/structured-persist";
import { fromExt } from "@/lib/supabase-ext";
import { isPlaceholderKey, abbrOf, syncPlayoffPlaceholders } from "./playoff-placeholders";

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
    if (next) { await tx.update("tournaments", { id: tid }, { builder_spec: next }); await persistStructure(tx, tid, next); attached = true; }
  });
  return attached;
}

/** Pure: the date fields a placeholder fixture takes from its setup row (play-by deadline or fixed day). */
export function placeholderDates(plan: any, unitLabel: string, stageName: string): { play_by?: string; scheduled_date?: string } {
  const unit = String(unitLabel).replace(/ · (Singles|Doubles|Singles and Doubles)$/i, "");
  const rows = ((plan?.stages ?? []) as any[]).filter((r) => r?.phase === "playoff" && abbrOf(String(r.name)) === abbrOf(stageName));
  const r = rows.find((x) => x.unit && String(x.unit) === unit) ?? rows.find((x) => !x.unit);
  if (!r) return {};
  if (r.mode === "scheduled" && r.date) return { scheduled_date: r.date };
  if (r.deadline) return { play_by: r.deadline };
  return {};
}

/**
 * Explicit organiser save → planned play-off FIXTURES with qualification placeholders (Pool A #1 v Pool B #2,
 * Winner SF1 v Winner SF2) and their dates. No players, results or bookings; the real games adopt them later.
 */
export async function createPlannedPlayoffFixtures(tid: string, plan: any): Promise<number> {
  const { created } = await syncPlayoffPlaceholders(tid);
  const [{ data: t }, { data: rows }] = await Promise.all([
    fromExt("tournaments").select("group_labels").eq("id", tid).maybeSingle(),
    fromExt("club_champs_matches").select("id, group_number, stage_label, stage_key, scheduled_time, play_by, scheduled_date").eq("champ_id", tid),
  ]);
  const labels = ((t as any)?.group_labels ?? {}) as Record<string, string>;
  for (const m of ((rows ?? []) as any[]).filter((x) => isPlaceholderKey(x.stage_key) && !x.scheduled_time)) {
    const d = placeholderDates(plan, labels[String(m.group_number)] ?? "", String(m.stage_label ?? ""));
    if (!d.play_by && !d.scheduled_date) continue;
    if ((d.play_by ?? null) === (m.play_by ?? null) && (d.scheduled_date ?? null) === (m.scheduled_date ?? null)) continue;
    await fromExt("club_champs_matches").update(d as any).eq("id", m.id).is("winner_member_id", null);
  }
  return created;
}
