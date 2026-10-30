/**
 * Organiser-scheduled ("Play on scheduled date/time") structured stages → court + start time per game.
 *
 * One planner for every stage after the first (Swiss→KO, RR→KO, pools→play-offs, SF, Final…):
 *   - the stage's OWN saved session (builder_spec stage.schedule: date, timeFrom–timeTo, courtIds),
 *   - slot length = stage matchMinutes → Stages & Scheduling "Match time per slot" (singles/doubles)
 *     → tournament match duration → 45,
 *   - deterministic order (play-off slot order rule, then bracket position),
 *   - existing bookings / other games on those courts block cells; the stage's own `sbs:` session
 *     reservation is the room the games go into, never a clash.
 * Only games with no court, no booking, both players known and not decided are placed. Nothing is
 * written by `planStageSlotAssignments`; `applyStageSlotAssignments` writes only after the organiser
 * confirms, re-plans first and refuses if anything changed. No bookings are created.
 */
import { fromExt } from "@/lib/supabase-ext";
import { divisionGroup, type TournamentSpec } from "@/lib/tournaments/engine-service";
import { allocateSlots, type Busy } from "@/lib/smart-builder/playoff-chain";
import { playoffSlotOrder, sortGamesForSlots } from "@/lib/smart-builder/playoff-slot-order";
import { isOwnStageReservation, loadSlotDivisions } from "@/lib/smart-builder/playoff-schedule";

const TERMINAL = ["completed", "forfeited", "walkover", "cancelled", "in_progress", "live", "confirmed"];
const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(":").map(Number); return h * 60 + (m || 0); };
const toHHMM = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/** Slot minutes for a stage: stage override → Stages & Scheduling match time → tournament → 45. */
export function stageSlotMinutes(o: { stageMinutes?: number | null; planScheduling?: any; doubles: boolean; tournamentMinutes?: number | null }): number {
  const own = Number(o.stageMinutes);
  if (own > 0) return own;
  const s = o.planScheduling ?? {};
  const plan = Number(o.doubles ? s.doubles : s.singles) || Number(o.doubles ? s.singles : s.doubles);
  if (plan > 0) return plan;
  return Number(o.tournamentMinutes) > 0 ? Number(o.tournamentMinutes) : 45;
}

export type AssignGame = { id: string; stage_key: string; group_number?: number | null; bracket_position?: number | null; doubles?: boolean };
export type AssignStage = { id: string; name: string; date: string; from: string; to: string; courtIds: number[]; minutes: number };
export type StageAssignment = {
  stageId: string; name: string; date: string; from: string; to: string; courtIds: number[]; minutes: number;
  slots: Array<{ matchId: string; courtId: number; time: string }>; unplaced: string[]; capacity: number;
};

/** Pure: place each stage's open games (given in slot order) into its own session, skipping busy cells. */
export function planStageSlots(stages: AssignStage[], games: AssignGame[], busy: Busy[]): StageAssignment[] {
  const taken = [...busy];
  return stages.map((s) => {
    const own = games.filter((g) => g.stage_key === s.id);
    const ordered = games.filter((g) => g.stage_key === s.id); // already in slot order
    const step = Math.max(15, s.minutes);
    let capacity = 0;
    for (let t = toMin(s.from); t + step <= toMin(s.to); t += step) for (const c of s.courtIds) if (!taken.some((b) => Number(b.courtId) === c && toMin(b.start) < t + step && toMin(b.end) > t)) capacity++;
    const cells = allocateSlots(ordered.length, { from: s.from, to: s.to, courtIds: s.courtIds, minutes: s.minutes, busy: taken });
    const slots: StageAssignment["slots"] = [];
    const unplaced: string[] = [];
    ordered.forEach((g, i) => {
      const c = cells[i];
      if (!c) { unplaced.push(g.id); return; }
      slots.push({ matchId: g.id, courtId: c.courtId, time: c.time });
      taken.push({ courtId: c.courtId, start: c.time, end: toHHMM(toMin(c.time) + step) });
    });
    return { stageId: s.id, name: s.name, date: s.date, from: s.from, to: s.to, courtIds: s.courtIds, minutes: s.minutes, slots, unplaced, capacity };
  });
}

export type AssignDiagnostic = { matchId?: string; stage?: string; reason: string };
export type StageAssignPlan = { champId: string; stages: StageAssignment[]; diagnostics: AssignDiagnostic[]; total: number; fingerprint: string };

/** Fixed (organiser-scheduled) stage sessions from the structured spec, one per stage id. */
export function fixedStageSessions(spec: TournamentSpec | null): Map<string, any> {
  const out = new Map<string, any>();
  for (const d of spec?.divisions ?? []) for (const s of d.stages ?? []) {
    if (out.has(s.id) || s.schedule?.rule !== "fixed") continue;
    out.set(s.id, s);
  }
  return out;
}

/** Read-only plan for the given games (or every open game of the tournament's fixed later stages). */
export async function planStageSlotAssignments(champId: string, matchIds?: string[]): Promise<StageAssignPlan> {
  const [{ data: t }, { data: rows }] = await Promise.all([
    fromExt("tournaments").select("builder_spec, beta_lifecycle, match_duration_minutes").eq("id", champId).maybeSingle(),
    fromExt("club_champs_matches").select("id, stage_key, stage_label, group_number, bracket_position, court_id, booking_id, status, winner_member_id, scheduled_date, scheduled_time, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id, is_bye").eq("champ_id", champId),
  ]);
  const spec = ((t as any)?.builder_spec ?? null) as TournamentSpec | null;
  const planSched = (t as any)?.beta_lifecycle?.format_plan?.scheduling ?? null;
  const sessions = fixedStageSessions(spec);
  const all = (rows ?? []) as any[];
  const wanted = matchIds ? all.filter((m) => matchIds.includes(m.id)) : all.filter((m) => m.stage_key && sessions.has(m.stage_key));
  const diagnostics: AssignDiagnostic[] = [];
  const open: any[] = [];
  for (const m of wanted) {
    const label = m.stage_label ?? "Game";
    if (m.is_bye) continue;
    if (m.court_id && m.scheduled_time) continue;
    if (m.booking_id) { diagnostics.push({ matchId: m.id, stage: label, reason: "Has a player court booking — left as booked." }); continue; }
    if (m.winner_member_id || TERMINAL.includes(String(m.status ?? "").toLowerCase())) continue;
    if (!m.player_a_member_id || !m.player_b_member_id) { diagnostics.push({ matchId: m.id, stage: label, reason: "Players not known yet." }); continue; }
    const st = m.stage_key ? sessions.get(m.stage_key) : null;
    if (!st) { diagnostics.push({ matchId: m.id, stage: label, reason: m.stage_key ? "Its stage is not set to “Play on scheduled date/time” in Stages & Scheduling." : "Not part of a structured stage — schedule it from the game row." }); continue; }
    const sch = st.schedule ?? {};
    const miss = [!sch.date && "date", !(sch.timeFrom && sch.timeTo) && "time window", !(sch.courtIds ?? []).length && "courts"].filter(Boolean);
    if (miss.length) { diagnostics.push({ matchId: m.id, stage: st.name, reason: `The saved ${st.name} session has no ${miss.join(", ")}.` }); continue; }
    open.push(m);
  }
  const usedStages = [...new Set(open.map((m) => m.stage_key as string))].map((id) => sessions.get(id)!);
  const divs = spec && usedStages.length ? await loadSlotDivisions(champId, spec) : [];
  const groupOfDiv = (id: string) => { const d = spec?.divisions.find((x) => x.divisionId === id); return d && spec ? divisionGroup(spec, d) : 99; };
  const stages: StageAssignment[] = [];
  // Group stages by date: one diary read per day.
  const byDate = new Map<string, any[]>();
  for (const s of usedStages) { const d = String(s.schedule.date).slice(0, 10); byDate.set(d, [...(byDate.get(d) ?? []), s]); }
  for (const [date, list] of byDate) {
    const courts = [...new Set(list.flatMap((s) => (s.schedule.courtIds as any[]).map(Number)))];
    const [{ data: bk }, { data: dayGames }] = await Promise.all([
      fromExt("bookings").select("court_id, start_time, end_time, external_id").eq("date", date).eq("status", "active").in("court_id", courts),
      fromExt("club_champs_matches").select("id, court_id, scheduled_time").eq("scheduled_date", date).in("court_id", courts),
    ]);
    const openIds = new Set(open.map((m) => m.id));
    const busy: Busy[] = [
      ...((bk ?? []) as any[]).filter((b) => !list.some((s) => isOwnStageReservation(b, { from: s.schedule.timeFrom, to: s.schedule.timeTo, courtIds: s.schedule.courtIds.map(Number) })))
        .map((b) => ({ courtId: Number(b.court_id), start: String(b.start_time).slice(0, 5), end: String(b.end_time).slice(0, 5) })),
      ...((dayGames ?? []) as any[]).filter((g) => !openIds.has(g.id) && g.scheduled_time).map((g) => {
        const st = String(g.scheduled_time).slice(0, 5);
        return { courtId: Number(g.court_id), start: st, end: toHHMM(toMin(st) + stageSlotMinutes({ planScheduling: planSched, doubles: false, tournamentMinutes: (t as any)?.match_duration_minutes })) };
      }),
    ];
    const defs: AssignStage[] = list.map((s) => {
      const games = open.filter((m) => m.stage_key === s.id);
      const doubles = games.some((m) => m.partner_a_member_id || m.partner_b_member_id);
      const order = divs.length ? playoffSlotOrder(divs, s.schedule.slotOrder) : null;
      if (order?.warnings.length) diagnostics.push({ stage: s.name, reason: `Court order kept in draw order — ${order.warnings.join("; ")}.` });
      return {
        id: s.id, name: s.name, date, from: String(s.schedule.timeFrom).slice(0, 5), to: String(s.schedule.timeTo).slice(0, 5),
        courtIds: (s.schedule.courtIds as any[]).map(Number),
        minutes: stageSlotMinutes({ stageMinutes: s.schedule.matchMinutes, planScheduling: planSched, doubles, tournamentMinutes: (t as any)?.match_duration_minutes }),
      };
    });
    const gamesHere = open.filter((m) => list.some((s) => s.id === m.stage_key));
    // Top players last: within a draw the bottom-half / lower brackets (higher bracket_position) play first.
    const byBracket = (a: any, b: any) => (Number(a.group_number) || 0) - (Number(b.group_number) || 0) || (Number(b.bracket_position) || 0) - (Number(a.bracket_position) || 0);
    const sorted = defs.flatMap((d) => {
      const s = list.find((x) => x.id === d.id);
      const mine = gamesHere.filter((m) => m.stage_key === d.id);
      return divs.length ? sortGamesForSlots(mine, playoffSlotOrder(divs, s.schedule.slotOrder).order, groupOfDiv) : mine.sort(byBracket);
    });
    stages.push(...planStageSlots(defs, sorted, busy));
  }
  for (const s of stages) for (const id of s.unplaced) diagnostics.push({ matchId: id, stage: s.name, reason: `No free court left between ${s.from} and ${s.to} on ${s.date} (${s.capacity} free ${s.minutes}-minute slot${s.capacity === 1 ? "" : "s"} on ${s.courtIds.length} court${s.courtIds.length === 1 ? "" : "s"}).` });
  const fingerprint = JSON.stringify(stages.map((s) => s.slots));
  return { champId, stages, diagnostics, total: open.length, fingerprint };
}

/**
 * Write the confirmed plan. Re-plans first and refuses if the result differs (someone booked a
 * court or scheduled a game meanwhile). Each write is guarded: only still-open games are touched.
 */
export async function applyStageSlotAssignments(plan: StageAssignPlan, matchIds?: string[]): Promise<{ scheduled: number; skipped: number }> {
  const fresh = await planStageSlotAssignments(plan.champId, matchIds);
  if (fresh.fingerprint !== plan.fingerprint) throw new Error("Courts or games changed since the preview. Nothing was saved — open the preview again.");
  let scheduled = 0, skipped = 0;
  for (const s of fresh.stages) for (const sl of s.slots) {
    const { data, error } = await fromExt("club_champs_matches")
      .update({ scheduled_date: s.date, scheduled_time: `${sl.time}:00`, court_id: sl.courtId, play_by: null } as any)
      .eq("id", sl.matchId).is("court_id", null).is("booking_id", null).is("winner_member_id", null).select("id");
    if (error) throw new Error(error.message);
    if ((data ?? []).length) scheduled++; else skipped++;
  }
  return { scheduled, skipped };
}
