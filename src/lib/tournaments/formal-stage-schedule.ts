/**
 * Central scheduling for formal play-off stages ("Play on scheduled date/time").
 *
 * Runs when the organiser CONFIRMS a Semifinal/Final proposal (never when it is only proposed).
 * Every unplayed, unbooked game of that stage gets a real date, start time and one of the
 * stage's selected courts inside its time window. Categories run from the LAST configured
 * category to the FIRST (top category latest); a category's games sit next to each other.
 * Played/started/booked games are never moved — they only block their slots.
 * Capacity shortfalls are reported (and block confirmation) instead of leaving TBD games.
 */
import { fromExt } from "@/lib/supabase-ext";

export type SlotGame = { id: string; group: number; bracket: number };
export type Busy = { courtId: number; start: string; end: string };
export type StageWindow = { date: string; from: string; to: string; courtIds: number[] };

const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(":").map(Number); return h * 60 + (m || 0); };
const toHHMM = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const TERMINAL = ["completed", "forfeited", "walkover", "cancelled", "in_progress", "live", "confirmed"];

/** Last configured category first → first category last; bracket order inside a category. */
export function orderForSlots(games: SlotGame[], groupOrder: number[]): SlotGame[] {
  const rank = (g: number) => { const i = groupOrder.indexOf(g); return i < 0 ? -1 : i; };
  return [...games].sort((a, b) => rank(b.group) - rank(a.group) || a.bracket - b.bracket);
}

/** Pure allocator: fill courts across the window in slot steps, skipping busy court/time cells. */
export function planFormalStageSlots(o: { games: SlotGame[]; groupOrder: number[]; window: StageWindow; minutes: number; busy: Busy[] }) {
  const ordered = orderForSlots(o.games, o.groupOrder);
  const step = Math.max(15, o.minutes || 45);
  const taken = [...o.busy];
  const slots: Array<{ id: string; courtId: number; time: string }> = [];
  const end = toMin(o.window.to);
  let i = 0;
  for (let t = toMin(o.window.from); t + step <= end && i < ordered.length; t += step) {
    for (const c of o.window.courtIds) {
      if (i >= ordered.length) break;
      if (taken.some((b) => b.courtId === c && toMin(b.start) < t + step && toMin(b.end) > t)) continue;
      slots.push({ id: ordered[i].id, courtId: c, time: toHHMM(t) });
      taken.push({ courtId: c, start: toHHMM(t), end: toHHMM(t + step) });
      i++;
    }
  }
  const overflow = ordered.slice(i).map((g) => g.id);
  return { slots, overflow };
}

export type FormalStep = { label: string; mode?: string; date: string | null; from?: string; to?: string; courtIds?: string[] };

export function isCentrallyScheduled(step: FormalStep | null | undefined): step is FormalStep & { date: string; from: string; to: string } {
  return !!step && step.mode === "scheduled" && !!step.date && !!step.from && !!step.to && (step.courtIds ?? []).length > 0;
}

/**
 * Load the stage's games + the day's occupancy and plan slots. `extra` = games about to be
 * created (for the capacity check before confirming).
 */
export async function planStageFromDb(champId: string, step: FormalStep, extra: SlotGame[] = []) {
  if (!isCentrallyScheduled(step)) return null;
  const date = step.date.slice(0, 10);
  const courtIds = step.courtIds!.map(Number);
  const [{ data: t }, { data: rows }, { data: dayGames }, { data: bk }] = await Promise.all([
    fromExt("tournaments").select("builder_spec, match_duration_minutes").eq("id", champId).maybeSingle(),
    fromExt("club_champs_matches").select("id, group_number, bracket_position, status, winner_member_id, booking_id, court_id, scheduled_date, scheduled_time, player_a_member_id, player_b_member_id").eq("champ_id", champId).eq("stage_label", step.label),
    fromExt("club_champs_matches").select("id, court_id, scheduled_time, stage_label, champ_id, status, winner_member_id, booking_id").eq("scheduled_date", date).in("court_id", courtIds),
    fromExt("bookings").select("court_id, start_time, end_time, external_id").eq("date", date).eq("status", "active").in("court_id", courtIds),
  ]);
  const spec: any = (t as any)?.builder_spec;
  const groupOrder: number[] = ((spec?.divisions ?? []) as any[]).map((d, i) => Number(d.groupNumber ?? i + 1));
  const minutes = Number((t as any)?.match_duration_minutes) || 45;
  const movable = (m: any) => !m.winner_member_id && !m.booking_id && !TERMINAL.includes(String(m.status ?? "").toLowerCase()) && m.player_a_member_id && m.player_b_member_id;
  const own = ((rows ?? []) as any[]).filter(movable);
  const ownIds = new Set(own.map((m) => m.id));
  const busy: Busy[] = [
    // Other games already on these courts that day (any stage/tournament) that we are not re-slotting.
    ...((dayGames ?? []) as any[]).filter((m) => !ownIds.has(m.id) && m.scheduled_time).map((m) => ({ courtId: Number(m.court_id), start: String(m.scheduled_time).slice(0, 5), end: toHHMM(toMin(m.scheduled_time) + minutes) })),
    // Bookings, except this stage's own central session reservation ("sbs:") — that is the room the games go into.
    ...((bk ?? []) as any[]).filter((b) => !String(b.external_id ?? "").startsWith("sbs:")).map((b) => ({ courtId: Number(b.court_id), start: String(b.start_time).slice(0, 5), end: String(b.end_time).slice(0, 5) })),
  ];
  const games: SlotGame[] = [...own.map((m) => ({ id: m.id, group: Number(m.group_number), bracket: Number(m.bracket_position) || 1 })), ...extra];
  const plan = planFormalStageSlots({ games, groupOrder, window: { date, from: step.from, to: step.to, courtIds }, minutes, busy });
  return { ...plan, date, minutes };
}

/** Allocate and save real date/time/court for every movable game of this stage. Never touches played/booked games. */
export async function scheduleFormalStage(champId: string, step: FormalStep) {
  const plan = await planStageFromDb(champId, step);
  if (!plan) return { scheduled: 0, overflow: [] as string[] };
  for (const s of plan.slots) {
    const { error } = await fromExt("club_champs_matches")
      .update({ scheduled_date: plan.date, scheduled_time: `${s.time}:00`, court_id: s.courtId, play_by: null } as any)
      .eq("id", s.id).is("winner_member_id", null).is("booking_id", null);
    if (error) throw new Error(error.message);
  }
  return { scheduled: plan.slots.length, overflow: plan.overflow };
}
