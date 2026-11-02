import { fromExt } from "@/lib/supabase-ext";
import { resolvePlayoffSessions } from "./playoff-schedule";
import { planFormalStageSlots, slotFitsStage, type Busy } from "@/lib/tournaments/formal-stage-schedule";
import { timeToMinutes, minutesToTime } from "@/lib/tournaments/self-schedule";
import type { TournamentSpec } from "@/lib/tournaments/engine-service";

export function planPendingPlayoffSlots(games: Array<{ id: string; group: number; bracket: number; placement: boolean }>, window: { date: string; from: string; to: string; courtIds: number[] }, minutes: number, busy: Busy[]) {
  const ordered = [...games].sort((a, b) => Number(b.placement) - Number(a.placement) || b.group - a.group || b.bracket - a.bracket);
  const slots: Array<{ id: string; courtId: number; time: string }> = [];
  let from = window.from;
  for (const game of ordered) {
    const next = planFormalStageSlots({ games: [game], groupOrder: [game.group], window: { ...window, from }, minutes, busy });
    const slot = next.slots[0];
    if (!slot) return { slots: [], overflow: ordered.map((g) => g.id) };
    slots.push(slot);
    from = minutesToTime(timeToMinutes(slot.time) + minutes);
  }
  return { slots, overflow: [] as string[] };
}

/** Explicit save only: refresh unstarted, unbooked play-off slots from the latest approved sessions. */
export async function refreshPlayoffSlots(tid: string, plan: any) {
  const [{ data: t, error: te }, { data: rows, error: re }] = await Promise.all([
    fromExt("tournaments").select("builder_spec, match_duration_minutes, club_id").eq("id", tid).single(),
    fromExt("club_champs_matches").select("id, stage_key, group_number, bracket_position, status, winner_member_id, booking_id, scheduled_date, scheduled_time, court_id").eq("champ_id", tid),
  ]);
  if (te || re) throw new Error(te?.message ?? re?.message);
  const spec = t?.builder_spec as unknown as TournamentSpec;
  if (!spec?.divisions) return;
  const minutes = Number(t?.match_duration_minutes) || 45;
  const sessions = resolvePlayoffSessions(spec, plan?.stages ?? []);
  for (const s of sessions) {
    const sch = s.schedule;
    if (!sch.date || !sch.timeFrom || !sch.timeTo || !sch.courtIds?.length) continue;
    const step = { label: s.name, mode: "scheduled", date: sch.date, from: sch.timeFrom, to: sch.timeTo, courtIds: sch.courtIds.map(String) };
    const own = ((rows ?? []) as any[]).filter((m) => s.keys.some((k) => k.group === m.group_number && k.stageId === String(m.stage_key).replace(/#ph$/, "")) && !m.winner_member_id && !m.booking_id && ["scheduled", "pending"].includes(m.status));
    const [{ data: games, error: ge }, { data: bookings, error: be }] = await Promise.all([
      fromExt("club_champs_matches").select("id, court_id, scheduled_time, status").eq("scheduled_date", sch.date).in("court_id", sch.courtIds),
      fromExt("bookings").select("court_id, start_time, end_time, external_id").eq("club_id", t.club_id).eq("date", sch.date).eq("status", "active").in("court_id", sch.courtIds),
    ]);
    if (ge || be) throw new Error(ge?.message ?? be?.message);
    const ids = new Set(own.map((m) => m.id));
    const busy: Busy[] = [
      ...((games ?? []) as any[]).filter((m) => !ids.has(m.id) && m.scheduled_time && m.status !== "cancelled").map((m) => ({ courtId: Number(m.court_id), start: String(m.scheduled_time).slice(0, 5), end: minutesToTime(timeToMinutes(m.scheduled_time) + minutes) })),
      ...((bookings ?? []) as any[]).map((b) => ({ courtId: Number(b.court_id), start: b.start_time, end: b.end_time })),
    ];
    const placement = (m: any) => {
      const stage = spec.divisions.find((d: any) => Number(d.groupNumber) === Number(m.group_number))?.stages.find((st) => st.id === String(m.stage_key).replace(/#ph$/, ""));
      return !!stage?.mapping?.losers;
    };
    const ordered = [...own].sort((a, b) => Number(placement(b)) - Number(placement(a)) || b.group_number - a.group_number || b.bracket_position - a.bracket_position);
    const orderValid = ordered.every((m, i) => i === 0 || timeToMinutes(m.scheduled_time ?? "00:00") >= timeToMinutes(ordered[i - 1].scheduled_time ?? "00:00") + minutes);
    if (orderValid && own.every((m) => slotFitsStage(step, m, minutes))) continue;
    const allocation = planPendingPlayoffSlots(own.map((m) => ({ id: m.id, group: m.group_number, bracket: Number(m.bracket_position) || 1, placement: placement(m) })), { date: sch.date, from: sch.timeFrom, to: sch.timeTo, courtIds: sch.courtIds }, minutes, busy);
    if (allocation.overflow.length) throw new Error(`${s.name}: not enough free court time in the saved session. No slots in this session were changed.`);
    for (const slot of allocation.slots) {
      const { error } = await fromExt("club_champs_matches").update({ scheduled_date: sch.date, scheduled_time: `${slot.time}:00`, court_id: slot.courtId, play_by: null } as any).eq("id", slot.id).eq("champ_id", tid).is("booking_id", null).is("winner_member_id", null).in("status", ["scheduled", "pending"]);
      if (error) throw new Error(error.message);
    }
  }
}