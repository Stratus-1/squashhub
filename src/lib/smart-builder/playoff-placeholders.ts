/**
 * Provisional play-off FIXTURES (players TBD) for predefined play-off stages.
 *
 * Generate / Rebuild draw creates the complete structure: every predefined play-off stage (QF → SF → Final)
 * gets visible fixture rows with qualification placeholders ("Pool A #1 v Pool B #2", "Winner SF1 v Winner SF2")
 * taken from the stage's own mapping (never inferred). They carry stage_key `<stageKey>#ph`, so progression,
 * standings and the "stage round once" guard never treat them as the real stage; "Assign courts & times"
 * schedules them like any play-off row (they hold real court time). When the engine creates the real stage
 * rows, `adoptPlaceholderRows` moves each placeholder's date/time/court onto its real game and deletes the
 * placeholder — never a duplicate, never a lost slot. Nothing here decides qualification.
 */
import { fromExt } from "@/lib/supabase-ext";
import { divisionGroup, type TournamentSpec } from "@/lib/tournaments/engine-service";

export const PH = "#ph";
export const isPlaceholderKey = (k: string | null | undefined) => String(k ?? "").endsWith(PH);
const L = (i: number) => String.fromCharCode(65 + i);

export function abbrOf(name: string): string {
  const n = name.toLowerCase();
  if (/quarter/.test(n)) return "QF";
  if (/semi/.test(n)) return "SF";
  if (/final/.test(n)) return "Final";
  return name;
}
export function legacyStageOf(name: string): string {
  const a = abbrOf(name);
  return a === "QF" ? "playoff_qf" : a === "SF" ? "playoff_sf" : a === "Final" ? "playoff_final" : "ko";
}

export type PlaceholderGame = { stageKey: string; stageName: string; order: number; a: string; b: string };

/** Pure: placeholder games for every predefined play-off stage of one division, in play order. */
export function placeholderGames(div: { stages: any[] }): PlaceholderGame[] {
  const stages = [...(div.stages ?? [])].sort((x, y) => x.order - y.order);
  const out: PlaceholderGame[] = [];
  const ids = new Map<string, string[]>(); // stage id → game ids (SF1, SF2 …)
  for (const st of stages.slice(1)) {
    const m = st.mapping;
    if (st.kind !== "mapped" || !m?.matches?.length) continue;
    const unit = new Map<string, any>((m.units ?? []).map((u: any) => [u.id, u]));
    const ab = abbrOf(st.name);
    const games = [...m.matches].sort((x: any, y: any) => (x.round ?? 1) - (y.round ?? 1) || x.order - y.order);
    const gid = games.map((_, i) => (games.length === 1 ? ab : `${ab}${i + 1}`));
    const prev = ids.get(m.sourceStageId) ?? [];
    const label = (uid: string) => {
      const s = unit.get(uid)?.slots?.[0];
      if (!s) return "TBD";
      if (m.source === "stage_winners") return `Winner ${prev[s.position - 1] ?? `game ${s.position}`}`;
      return m.pools > 1 ? `Pool ${L(s.pool)} #${s.position}` : `#${s.position}`;
    };
    games.forEach((g: any, i: number) => out.push({ stageKey: st.id, stageName: st.name, order: i + 1, a: label(g.a), b: label(g.b) }));
    ids.set(st.id, gid);
  }
  return out;
}

const DONE = ["completed", "forfeited", "walkover", "in_progress", "live", "confirmed"];

/**
 * Rebuild placeholders for the whole tournament (idempotent). Stale placeholders are removed; stages that
 * already have real games get none. Placeholders never carry players or results.
 */
export async function syncPlayoffPlaceholders(champId: string): Promise<{ created: number }> {
  const { data: t } = await fromExt("tournaments").select("builder_spec, builder_architecture").eq("id", champId).maybeSingle();
  const spec = (t as any)?.builder_spec as TournamentSpec | null;
  if ((t as any)?.builder_architecture !== "structured" || !spec?.divisions?.length) return { created: 0 };
  const [{ data: rows }, { data: divs }, { data: stages }] = await Promise.all([
    fromExt("club_champs_matches").select("id, stage_key, group_number, status, winner_member_id").eq("champ_id", champId),
    fromExt("tournament_divisions").select("id, spec_key").eq("tournament_id", champId),
    fromExt("tournament_stages").select("id, division_id, spec_key").eq("tournament_id", champId),
  ]);
  const all = (rows ?? []) as any[];
  const old = all.filter((m) => isPlaceholderKey(m.stage_key) && !m.winner_member_id && !DONE.includes(String(m.status ?? "").toLowerCase()));
  if (old.length) {
    const { error } = await fromExt("club_champs_matches").delete().in("id", old.map((m) => m.id));
    if (error) throw new Error(error.message);
  }
  await fromExt("club_champs_rounds").delete().eq("champ_id", champId).like("stage_key", `%${PH}`);
  const divId = new Map(((divs ?? []) as any[]).map((d) => [d.spec_key, d.id]));
  let created = 0;
  for (const d of spec.divisions) {
    const g = divisionGroup(spec, d);
    const division_id = divId.get(d.divisionId);
    if (!division_id) continue;
    const games = placeholderGames(d);
    const byStage = new Map<string, PlaceholderGame[]>();
    for (const x of games) byStage.set(x.stageKey, [...(byStage.get(x.stageKey) ?? []), x]);
    let i = 0;
    for (const [sk, list] of byStage) {
      i++;
      if (all.some((m) => m.group_number === g && m.stage_key === sk)) continue; // real games exist
      const stage_id = ((stages ?? []) as any[]).find((s) => s.division_id === division_id && s.spec_key === sk)?.id;
      if (!stage_id) continue;
      const name = list[0].stageName, ab = abbrOf(name);
      const round_number = 900 + i;
      const { data: r, error: re } = await fromExt("club_champs_rounds").insert({
        champ_id: champId, group_number: g, round_number, division_id, stage_id, stage_key: `${sk}${PH}`,
        round_type: ab === "SF" ? "semi_final" : ab === "Final" ? "final" : "knockout", label: name, status: "pending",
      } as any).select("id").single();
      if (re) throw new Error(re.message);
      const { error } = await fromExt("club_champs_matches").insert(list.map((x) => ({
        champ_id: champId, group_number: g, round_number, stage: legacyStageOf(name), stage_key: `${sk}${PH}`, stage_label: list.length === 1 ? name : `${name} ${x.order}`,
        status: "scheduled", bracket_position: x.order, placeholder_a: x.a, placeholder_b: x.b,
        division_id, stage_id, round_id: (r as any).id,
      })) as any);
      if (error) throw new Error(error.message);
      created += list.length;
    }
  }
  return { created };
}

export type PhRow = { id: string; group: number; stageKey: string; order: number; date: string | null; time: string | null; courtId: number | null };

/** Pure: pair each placeholder with the real game of the same division + stage, in bracket order. */
export function placeholderAdoption(placeholders: PhRow[], real: PhRow[]) {
  const out: Array<{ placeholder: PhRow; real: PhRow }> = [];
  const key = (r: PhRow) => `${r.group}|${r.stageKey.replace(PH, "")}`;
  const groups = new Map<string, PhRow[]>();
  for (const r of real) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  const phGroups = new Map<string, PhRow[]>();
  for (const p of placeholders) phGroups.set(key(p), [...(phGroups.get(key(p)) ?? []), p]);
  for (const [k, ps] of phGroups) {
    const rs = (groups.get(k) ?? []).sort((a, b) => a.order - b.order);
    if (!rs.length) continue;
    ps.sort((a, b) => a.order - b.order).forEach((p, i) => { if (rs[i]) out.push({ placeholder: p, real: rs[i] }); });
  }
  return out;
}

/** Real stage games take over their placeholder's date/time/court; adopted placeholders are deleted. */
export async function adoptPlaceholderRows(champId: string): Promise<number> {
  const { data } = await fromExt("club_champs_matches").select("id, group_number, stage_key, bracket_position, created_at, scheduled_date, scheduled_time, court_id, winner_member_id, status").eq("champ_id", champId);
  const all = (data ?? []) as any[];
  const toRow = (m: any): PhRow => ({ id: m.id, group: Number(m.group_number), stageKey: String(m.stage_key ?? ""), order: Number(m.bracket_position) || Number(new Date(m.created_at)), date: m.scheduled_date ?? null, time: m.scheduled_time ?? null, courtId: m.court_id ?? null });
  const ph = all.filter((m) => isPlaceholderKey(m.stage_key)).map(toRow);
  if (!ph.length) return 0;
  const keys = new Set(ph.map((p) => p.stageKey.replace(PH, "")));
  const real = all.filter((m) => keys.has(String(m.stage_key)) && !m.winner_member_id && !DONE.includes(String(m.status ?? "").toLowerCase())).map(toRow);
  const plan = placeholderAdoption(ph, real);
  for (const { placeholder: p, real: r } of plan) {
    await fromExt("club_champs_matches").delete().eq("id", p.id);
    if (p.time && p.courtId != null && !r.time) {
      const { error } = await fromExt("club_champs_matches").update({ scheduled_date: p.date, scheduled_time: p.time, court_id: p.courtId, play_by: null } as any).eq("id", r.id).is("winner_member_id", null);
      if (error) throw new Error(error.message);
    }
  }
  // Placeholder stages whose real games now exist: remove any leftover placeholders and their round.
  const adoptedStages = new Set(plan.map((x) => `${x.placeholder.group}|${x.placeholder.stageKey}`));
  const left = ph.filter((p) => adoptedStages.has(`${p.group}|${p.stageKey}`) && !plan.some((x) => x.placeholder.id === p.id));
  if (left.length) await fromExt("club_champs_matches").delete().in("id", left.map((p) => p.id));
  for (const k of new Set(plan.map((x) => x.placeholder.stageKey))) {
    const { count } = await fromExt("club_champs_matches").select("id", { count: "exact", head: true }).eq("champ_id", champId).eq("stage_key", k);
    if (!count) await fromExt("club_champs_rounds").delete().eq("champ_id", champId).eq("stage_key", k);
  }
  return plan.length;
}
