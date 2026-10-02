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
import type { TournamentSpec } from "@/lib/tournaments/engine-service";
import { allocateSlots, type Busy } from "./playoff-chain";

export interface ScheduleReport { booked: number; unplaced: Array<{ stage: string; reason: string }> }

export async function schedulePlannedPlayoffGames(champId: string): Promise<ScheduleReport> {
  const report: ScheduleReport = { booked: 0, unplaced: [] };
  const { data: t } = await fromExt("tournaments").select("builder_spec").eq("id", champId).maybeSingle();
  const spec = (t as any)?.builder_spec as TournamentSpec | null;
  if (!spec?.divisions?.length) return report;
  const sessions = spec.divisions.flatMap((d) => d.stages.filter((s) => s.order > 0 && s.schedule?.rule === "fixed" && s.schedule.date && s.schedule.timeFrom && s.schedule.timeTo && (s.schedule.courtIds ?? []).length).map((s) => ({ d, s })));
  if (!sessions.length) return report;
  const { data: rows } = await fromExt("club_champs_matches").select("id, stage_key, court_id, booking_id, status, player_a_member_id, player_b_member_id, bracket_position").eq("champ_id", champId).in("stage_key", sessions.map((x) => x.s.id));
  for (const { s } of sessions) {
    const todo = ((rows ?? []) as any[]).filter((m) => m.stage_key === s.id && !m.court_id && !m.booking_id && m.player_a_member_id && m.player_b_member_id && !["completed", "forfeited", "walkover", "cancelled"].includes(m.status))
      .sort((a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0));
    if (!todo.length) continue;
    const sch = s.schedule, date = String(sch.date).slice(0, 10), minutes = sch.matchMinutes ?? 45;
    const { data: bk } = await fromExt("bookings").select("court_id, start_time, end_time").eq("date", date).eq("status", "active").in("court_id", sch.courtIds!);
    const busy: Busy[] = ((bk ?? []) as any[]).map((b) => ({ courtId: b.court_id, start: b.start_time, end: b.end_time }));
    const slots = allocateSlots(todo.length, { from: sch.timeFrom!, to: sch.timeTo!, courtIds: sch.courtIds!, minutes, busy });
    for (const [i, m] of todo.entries()) {
      const sl = slots[i];
      if (!sl) { report.unplaced.push({ stage: s.name, reason: `No free court left between ${sch.timeFrom} and ${sch.timeTo} on ${date}.` }); continue; }
      const { error } = await rpcExt("self_schedule_champ_match", { p_match_id: m.id, p_court_id: sl.courtId, p_date: date, p_time: `${sl.time}:00`, p_duration_minutes: minutes });
      if (error) report.unplaced.push({ stage: s.name, reason: error.message });
      else report.booked++;
    }
  }
  return report;
}
