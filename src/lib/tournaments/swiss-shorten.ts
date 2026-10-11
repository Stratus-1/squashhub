/**
 * End a live Swiss stage early (e.g. draw created with 6 rounds, setup later agreed 5 + quarterfinals).
 *
 * This is an explicit, confirmed organiser action — never automatic — and it is guarded both here and
 * by the existing server-side round guard (which reads the same stored round count):
 *  - the new count must be LOWER than the live stage's configured count;
 *  - no fixture may exist beyond the new count (nothing is ever deleted);
 *  - every real fixture up to the new count must be final (byes are final by definition);
 *  - results, seed order and existing fixtures are never touched.
 *
 * Writes the new count to all three places the live draw reads it from:
 * `tournaments.builder_spec` (engine spec), `tournament_stages.config.swissRounds` (server guard /
 * progression) and `club_champs.swiss_rounds` (legacy standings mirror).
 */
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { isFinalFixture } from "./swiss-round-gate";

export type SwissShortenCheck =
  | { ok: true }
  | { ok: false; reason: string };

/** Pure guard, unit-tested: may this stage's round count become `newRounds`? */
export function swissShortenCheck(
  rows: Array<{ round_number?: number | null; player_a_member_id?: string | null; player_b_member_id?: string | null; status?: string | null; winner_member_id?: string | null; score?: string | null }>,
  liveRounds: number,
  newRounds: number,
): SwissShortenCheck {
  if (!Number.isFinite(newRounds) || newRounds < 1) return { ok: false, reason: "The new round count must be at least 1." };
  if (newRounds >= liveRounds) return { ok: false, reason: `The live stage is already set to ${liveRounds} rounds — pick a lower number.` };
  const beyond = rows.filter((m) => (m.round_number ?? 1) > newRounds);
  if (beyond.length) return { ok: false, reason: `Round ${newRounds + 1} or later already has games — the stage can't be shortened past them.` };
  const open = rows.filter((m) => (m.round_number ?? 1) <= newRounds && m.player_a_member_id && m.player_b_member_id
    && !isFinalFixture({ a: m.player_a_member_id, b: m.player_b_member_id, status: m.status, winner: m.winner_member_id, score: m.score }));
  if (open.length) return { ok: false, reason: `Finish the ${open.length} open match(es) of the current round first.` };
  return { ok: true };
}

export async function shortenSwissStage(tournamentId: string, divisionIndex: number, stageId: string, newRounds: number): Promise<void> {
  const [{ data: t }, { data: matches }] = await Promise.all([
    fromExt("tournaments").select("builder_spec, builder_architecture").eq("id", tournamentId).maybeSingle(),
    fromExt("club_champs_matches").select("*").eq("champ_id", tournamentId),
  ]);
  if ((t as any)?.builder_architecture !== "structured") throw new Error("Only structured (Beta) tournaments can be changed here.");
  const spec = (t as any).builder_spec as any;
  const d = spec?.divisions?.[divisionIndex];
  const st = d?.stages?.find((s: any) => s.id === stageId && s.kind === "swiss");
  if (!st) throw new Error("Swiss stage not found in the live draw.");
  const liveRounds = Number(st.swissRounds) || 0;
  const rows = ((matches ?? []) as any[]).filter((m) => m.group_number === divisionIndex + 1 && m.stage_key === stageId);
  const check = swissShortenCheck(rows, liveRounds, newRounds);
  if (!check.ok) throw new Error((check as { ok: false; reason: string }).reason);

  st.swissRounds = newRounds;
  const { error: e1 } = await fromExt("tournaments").update({ builder_spec: spec }).eq("id", tournamentId);
  if (e1) throw e1;

  const { data: stageRows } = await fromExt("tournament_stages").select("id, config").eq("tournament_id", tournamentId).eq("spec_key", stageId);
  for (const row of stageRows ?? []) {
    const { error } = await fromExt("tournament_stages").update({ config: { ...((row as any).config ?? {}), swissRounds: newRounds } }).eq("id", (row as any).id);
    if (error) throw error;
  }

  const { data: champ } = await fromExt("club_champs").select("id, swiss_rounds").eq("id", tournamentId).maybeSingle();
  if (champ) {
    const sr = { ...(((champ as any).swiss_rounds as Record<string, number> | null) ?? {}), [String(divisionIndex + 1)]: newRounds };
    const { error } = await fromExt("club_champs").update({ swiss_rounds: sr }).eq("id", tournamentId);
    if (error) throw error;
  }
}
