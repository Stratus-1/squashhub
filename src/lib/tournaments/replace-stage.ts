/**
 * Replace an UNPLAYED last stage of a structured tournament (e.g. round robin -> quarterfinal/semi/final).
 * The server function `replace_unplayed_structured_stage` refuses if any game in the stage is played,
 * started or has a court booking, and only the last stage can be replaced. Earlier stages are never touched.
 */
import { supabase } from "@/integrations/supabase/client";
import type { PlannedStage } from "@/lib/tournaments/contract";

export type ReplacementChoice =
  | { kind: "knockout"; qualifiers: number; bottomBracket?: boolean }
  | { kind: "pools"; pools: number };

const KO_NAME: Record<number, string> = { 2: "Final", 4: "Semi-finals & final", 8: "Quarterfinals, semi-finals & final", 16: "Last 16 to final" };

/** Builds the new stage, keeping the old stage's id, order, discipline and schedule. */
export function buildReplacementStage(old: PlannedStage, choice: ReplacementChoice, entrants: number): PlannedStage {
  const base = { id: old.id, order: old.order, discipline: old.discipline, schedule: old.schedule, generation: old.generation ?? "owner_approval" } as const;
  if (choice.kind === "knockout") {
    const q = choice.qualifiers;
    if (q < 2 || (q & (q - 1)) !== 0) throw new Error("Choose 2, 4, 8 or 16 qualifiers.");
    const bottom = !!choice.bottomBracket;
    const need = bottom ? q * 2 : q;
    if (need > entrants) throw new Error(bottom ? `A top and bottom bracket of ${q} needs ${need} players — only ${entrants} are available.` : `Only ${entrants} players are available.`);
    return { ...base, kind: "knockout", name: `Play-offs · ${KO_NAME[q] ?? `Top ${q}`}${bottom ? " (top & bottom)" : ""}`, drawSize: q, thirdPlace: false,
      ...(bottom ? { bottomBracket: true } : {}),
      progression: { mode: "top_n", top: need, standings: "reset" } as PlannedStage["progression"] };
  }
  const pools = Math.max(1, Math.floor(choice.pools));
  if (entrants < pools * 2) throw new Error(`${entrants} players can't fill ${pools} pools.`);
  return { ...base, kind: "pools", name: pools > 1 ? "Stage 2 · Pools" : "Stage 2 · Round robin", pools, poolSize: Math.ceil(entrants / pools),
    progression: { mode: "all_continue", standings: "reset" } as PlannedStage["progression"] };
}

export async function replaceUnplayedStage(tid: string, divisionKey: string, stage: PlannedStage): Promise<{ removed_games: number }> {
  const { data, error } = await (supabase.rpc as any)("replace_unplayed_structured_stage", {
    p_tid: tid, p_division_key: divisionKey, p_stage_key: stage.id, p_new_stage: stage,
  });
  if (error) throw new Error(error.message);
  return data as { removed_games: number };
}
