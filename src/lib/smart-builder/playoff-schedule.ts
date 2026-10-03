/**
 * Planned play-off sessions → real court bookings for the games progression just created.
 *
 * A fixed-date play-off stage carries its planned session (date, time window, courts). Once its games exist,
 * each unscheduled game is placed in the first free court slot inside that window and booked through the
 * existing `self_schedule_champ_match` RPC — the same path as "Book court": venue/court rules, clash checks
 * against the venue's diary, the booking row and the players' notifications. Idempotent: games that already
 * have a court/booking are skipped, so reloads and retries never double-book.
 */
import { fromExt, rpcExt } from "@/lib/supabase-ext";
import { divisionGroup, type TournamentSpec } from "@/lib/tournaments/engine-service";
import type { PlannedStage } from "@/lib/tournaments/contract";
import { playoffSlotOrder, sortGamesForSlots, type SlotDivision } from "./playoff-slot-order";
import { allocateSlots, type Busy } from "./playoff-chain";

/** A stage-session court reservation made by "Book courts now" (sbs:…) covering this stage's own window. */
export function isOwnStageReservation(b: { external_id?: string | null; start_time: string; end_time: string; court_id: number }, w: { from: string; to: string; courtIds: number[] }): boolean {
  const hm = (t: string) => String(t).slice(0, 5);
  return String(b.external_id ?? "").startsWith("sbs:") && w.courtIds.map(Number).includes(Number(b.court_id)) && hm(b.start_time) <= hm(w.from) && hm(b.end_time) >= hm(w.to);
}

/** Pure: the parts of a reservation left once a game slot is cut out of it (empty parts dropped). */
export function carveReservation(block: { start: string; end: string }, slot: { start: string; end: string }): Array<{ start: string; end: string }> {
  const hm = (t: string) => String(t).slice(0, 5);
  const out: Array<{ start: string; end: string }> = [];
  if (hm(block.start) < hm(slot.start)) out.push({ start: hm(block.start), end: hm(slot.start) });
  if (hm(slot.end) < hm(block.end)) out.push({ start: hm(slot.end), end: hm(block.end) });
  return out;
}

export interface ScheduleReport { booked: number; unplaced: Array<{ stage: string; reason: string }> }

/** Draws with their gender + linked league levels, for the slot-order rule. */
export async function loadSlotDivisions(champId: string, spec: TournamentSpec): Promise<SlotDivision[]> {
  const { data: t } = await fromExt("tournaments").select("league_sources, league_genders").eq("id", champId).maybeSingle();
  const sources = ((t as any)?.league_sources ?? {}) as Record<string, string[]>;
  const genders = ((t as any)?.league_genders ?? {}) as Record<string, string>;
  const ids = [...new Set(Object.values(sources).flat())];
  const { data: ls } = ids.length ? await fromExt("leagues").select("id, level").in("id", ids) : { data: [] };
  const lvl = new Map(((ls ?? []) as any[]).map((l) => [l.id, l.level == null ? null : Number(l.level)] as const));
  return spec.divisions.map((d) => {
    const g = String(divisionGroup(spec, d));
    const gender = genders[g] === "ladies" ? "ladies" : genders[g] === "men" ? "men" : null;
    return { id: d.divisionId, label: d.label, gender, leagueLevels: (sources[g] ?? []).map((id) => lvl.get(id) ?? null) };
  });
}

/** Slot order per centrally scheduled play-off stage (preview + scheduler share this). */
export async function playoffSlotPlan(champId: string, spec: TournamentSpec) {
  const divs = await loadSlotDivisions(champId, spec);
  const stages = new Map<string, { name: string; slotOrder?: string[] | null }>();
  for (const d of spec.divisions) for (const s of d.stages) if (s.order > 0 && s.schedule?.rule === "fixed" && !stages.has(s.id)) stages.set(s.id, { name: s.name, slotOrder: s.schedule.slotOrder });
  return [...stages.entries()].map(([id, s]) => ({ stageId: id, name: s.name, ...playoffSlotOrder(divs, s.slotOrder), labels: Object.fromEntries(divs.map((d) => [d.id, d.label])) }));
}

export async function schedulePlannedPlayoffGames(champId: string): Promise<ScheduleReport> {
  const report: ScheduleReport = { booked: 0, unplaced: [] };
  const { data: t } = await fromExt("tournaments").select("builder_spec").eq("id", champId).maybeSingle();
  const spec = (t as any)?.builder_spec as TournamentSpec | null;
  if (!spec?.divisions?.length) return report;
  // One entry per stage (stage ids repeat across draws) — all draws' games are slotted together.
  const sessions = new Map<string, PlannedStage>();
  for (const d of spec.divisions) for (const s of d.stages) if (s.order > 0 && s.schedule?.rule === "fixed" && s.schedule.date && s.schedule.timeFrom && s.schedule.timeTo && (s.schedule.courtIds ?? []).length && !sessions.has(s.id)) sessions.set(s.id, s);
  if (!sessions.size) return report;
  const divs = await loadSlotDivisions(champId, spec);
  const groupOf = (id: string) => { const d = spec.divisions.find((x) => x.divisionId === id); return d ? divisionGroup(spec, d) : 99; };
  const { data: rows } = await fromExt("club_champs_matches").select("id, stage_key, group_number, court_id, booking_id, status, player_a_member_id, player_b_member_id, bracket_position").eq("champ_id", champId).in("stage_key", [...sessions.keys()]);
  for (const s of sessions.values()) {
    // Games already given a court/booking (incl. organiser overrides) are never moved.
    const open = ((rows ?? []) as any[]).filter((m) => m.stage_key === s.id && !m.court_id && !m.booking_id && m.player_a_member_id && m.player_b_member_id && !["completed", "forfeited", "walkover", "cancelled"].includes(m.status));
    if (!open.length) continue;
    const plan = playoffSlotOrder(divs, s.schedule.slotOrder);
    if (plan.warnings.length) report.unplaced.push({ stage: s.name, reason: `Court order kept in draw order — ${plan.warnings.join("; ")}.` });
    const todo = sortGamesForSlots(open, plan.order, groupOf);
    const sch = s.schedule, date = String(sch.date).slice(0, 10), minutes = sch.matchMinutes ?? 45;
    const courtIds = sch.courtIds!.map(Number);
    const win = { from: sch.timeFrom!, to: sch.timeTo!, courtIds };
    const { data: bk } = await fromExt("bookings").select("id, club_id, court_id, start_time, end_time, external_id, source, guest_name, ops_note").eq("date", date).eq("status", "active").in("court_id", courtIds);
    // The stage's own session reservation is the room these games go into — never a clash.
    let reserved = ((bk ?? []) as any[]).filter((b) => isOwnStageReservation(b, win));
    const busy: Busy[] = ((bk ?? []) as any[]).filter((b) => !reserved.includes(b)).map((b) => ({ courtId: b.court_id, start: b.start_time, end: b.end_time }));
    const slots = allocateSlots(todo.length, { from: sch.timeFrom!, to: sch.timeTo!, courtIds, minutes, busy });
    for (const [i, m] of todo.entries()) {
      const sl = slots[i];
      if (!sl) { report.unplaced.push({ stage: s.name, reason: `No free court left between ${sch.timeFrom} and ${sch.timeTo} on ${date}.` }); continue; }
      const slotEnd = (() => { const [h, mm] = sl.time.split(":").map(Number); const t = h * 60 + mm + minutes; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; })();
      // Cut the game's slot out of the reservation so the court guard accepts it; the rest stays reserved.
      const block = reserved.find((b) => Number(b.court_id) === sl.courtId && String(b.start_time).slice(0, 5) <= sl.time && String(b.end_time).slice(0, 5) >= slotEnd);
      if (block) {
        const rest = carveReservation({ start: block.start_time, end: block.end_time }, { start: sl.time, end: slotEnd });
        const { error: de } = await fromExt("bookings").delete().eq("id", block.id);
        if (de) { report.unplaced.push({ stage: s.name, reason: de.message }); continue; }
        reserved = reserved.filter((b) => b !== block);
        for (const r of rest) {
          const row = { club_id: block.club_id, court_id: block.court_id, user_id: null, club_member_id: null, date, start_time: `${r.start}:00`, end_time: `${r.end}:00`, status: "active", is_friendly: false, guest_name: block.guest_name, source: block.source, external_id: `${String(block.external_id).split("@")[0]}@${r.start.replace(":", "")}`, ops_note: block.ops_note };
          const { data: ins, error: ie } = await fromExt("bookings").insert(row as any).select("id, club_id, court_id, start_time, end_time, external_id, source, guest_name, ops_note").single();
          if (!ie && ins) reserved.push(ins);
        }
      }
      const { error } = await rpcExt("self_schedule_champ_match", { p_match_id: m.id, p_court_id: sl.courtId, p_date: date, p_time: `${sl.time}:00`, p_duration_minutes: minutes });
      if (error) report.unplaced.push({ stage: s.name, reason: error.message });
      else report.booked++;
    }
  }
  return report;
}
