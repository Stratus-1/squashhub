/**
 * THE fixed-stage scheduler — one allocator for every tournament round/stage.
 *
 * Invariant: a round/stage configured with a FIXED date + time window + selected (centrally
 * reserved) courts never produces TBD/player-booked games. Every unplayed, unbooked game of that
 * stage gets a real date, start time and one of the stage's courts inside the window — whether it
 * is a paced Round N, a round-robin round, a Quarterfinal, Semifinal or Final.
 *
 * Runs when fixtures are CONFIRMED/GENERATED (never when only proposed). Categories run from the
 * LAST configured category to the FIRST (top category latest); a category's games sit together.
 * Played/started/booked games are never moved — they only block their slots. Capacity shortfalls
 * are reported (and block confirmation) instead of leaving TBD games.
 * "Play by a date" keeps player booking; "Decide later" stays intentionally unscheduled.
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
export function planFormalStageSlots(o: { games: SlotGame[]; groupOrder: number[]; window: StageWindow; minutes: number; busy: Busy[]; bufferMinutes?: number }) {
  const ordered = orderForSlots(o.games, o.groupOrder);
  const step = Math.max(15, o.minutes || 45) + Math.max(0, o.bufferMinutes ?? 0);
  const taken = [...o.busy];
  const slots: Array<{ id: string; courtId: number; time: string }> = [];
  const end = toMin(o.window.to);
  let i = 0;
  let capacity = 0;
  for (let t = toMin(o.window.from); t + step <= end; t += step) {
    for (const c of o.window.courtIds) {
      if (taken.some((b) => b.courtId === c && toMin(b.start) < t + step && toMin(b.end) > t)) continue;
      capacity++;
      if (i >= ordered.length) continue;
      slots.push({ id: ordered[i].id, courtId: c, time: toHHMM(t) });
      taken.push({ courtId: c, start: toHHMM(t), end: toHHMM(t + step) });
      i++;
    }
  }
  const overflow = ordered.slice(i).map((g) => g.id);
  return { slots, overflow, required: ordered.length, available: capacity };
}

export type FormalStep = { label: string; mode?: string; date: string | null; from?: string; to?: string; courtIds?: string[] };

/** Stage scheduling mode, as the organiser chose it. */
export type StageScheduling = "fixed" | "play_by" | "decide_later";
export function stageScheduling(step: FormalStep | null | undefined): StageScheduling {
  if (isCentrallyScheduled(step)) return "fixed";
  if (step?.mode === "play_by") return "play_by";
  return "decide_later";
}

export function isCentrallyScheduled(step: FormalStep | null | undefined): step is FormalStep & { date: string; from: string; to: string } {
  return !!step && step.mode === "scheduled" && !!step.date && !!step.from && !!step.to && (step.courtIds ?? []).length > 0;
}
/** Alias — the universal name. */
export const isFixedStage = isCentrallyScheduled;

const normLabel = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/s$/, "");

/** Every configured stage of the tournament's plan, as scheduler steps. */
export function planSteps(formatPlan: any): FormalStep[] {
  return ((formatPlan?.stages ?? []) as any[]).filter((s) => s?.name).map((s) => ({
    label: String(s.name), mode: s.mode, date: s.date ? String(s.date).slice(0, 10) : null,
    from: s.from || undefined, to: s.to || undefined, courtIds: (s.courtIds ?? []).map(String),
  }));
}

/** Resolve the configured stage for a round label (e.g. "Round 2", "Semifinals", "Final"). */
export function findStep(steps: FormalStep[], label: string): FormalStep | null {
  return steps.find((s) => normLabel(s.label) === normLabel(label)) ?? null;
}

export async function loadPlanSteps(champId: string): Promise<FormalStep[]> {
  const { data } = await fromExt("tournaments").select("beta_lifecycle").eq("id", champId).maybeSingle();
  return planSteps((data as any)?.beta_lifecycle?.format_plan);
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
    fromExt("club_champs_matches").select("id, group_number, bracket_position, status, winner_member_id, booking_id, court_id, scheduled_date, scheduled_time, stage_label, player_a_member_id, player_b_member_id").eq("champ_id", champId),
    fromExt("club_champs_matches").select("id, court_id, scheduled_time, stage_label, champ_id, status, winner_member_id, booking_id").eq("scheduled_date", date).in("court_id", courtIds),
    fromExt("bookings").select("court_id, start_time, end_time, external_id").eq("date", date).eq("status", "active").in("court_id", courtIds),
  ]);
  const spec: any = (t as any)?.builder_spec;
  const groupOrder: number[] = ((spec?.divisions ?? []) as any[]).map((d, i) => Number(d.groupNumber ?? i + 1));
  const minutes = Number((t as any)?.match_duration_minutes) || 45;
  const movable = (m: any) => !m.winner_member_id && !m.booking_id && !TERMINAL.includes(String(m.status ?? "").toLowerCase()) && m.player_a_member_id && m.player_b_member_id;
  const own = ((rows ?? []) as any[]).filter((m) => normLabel(m.stage_label) === normLabel(step.label) && movable(m));
  const ownIds = new Set(own.map((m) => m.id));
  const busy: Busy[] = [
    // Other games already on these courts that day (any stage/tournament) that we are not re-slotting.
    ...((dayGames ?? []) as any[]).filter((m) => !ownIds.has(m.id) && m.scheduled_time).map((m) => ({ courtId: Number(m.court_id), start: String(m.scheduled_time).slice(0, 5), end: toHHMM(toMin(m.scheduled_time) + minutes) })),
    // Bookings, except the stage's own central session reservation ("sbs:") — that is the room the games go into.
    ...((bk ?? []) as any[]).filter((b) => !String(b.external_id ?? "").startsWith("sbs:")).map((b) => ({ courtId: Number(b.court_id), start: String(b.start_time).slice(0, 5), end: String(b.end_time).slice(0, 5) })),
  ];
  const games: SlotGame[] = [...own.map((m) => ({ id: m.id, group: Number(m.group_number), bracket: Number(m.bracket_position) || 1 })), ...extra];
  const plan = planFormalStageSlots({ games, groupOrder, window: { date, from: step.from, to: step.to, courtIds }, minutes, busy });
  return { ...plan, date, minutes };
}

export function capacityMessage(step: FormalStep, plan: { required: number; available: number; overflow: string[] }) {
  return `Not enough court time for ${step.label}: ${plan.required} game${plan.required === 1 ? "" : "s"} need a slot but only ${plan.available} fit on ${step.date} between ${step.from} and ${step.to} on the selected courts. Widen the time window or add courts in setup.`;
}

/** Allocate and save real date/time/court for every movable game of this stage. Never touches played/booked games. */
export async function scheduleFormalStage(champId: string, step: FormalStep) {
  const plan = await planStageFromDb(champId, step);
  if (!plan) return { scheduled: 0, overflow: [] as string[], required: 0, available: 0 };
  for (const s of plan.slots) {
    const { error } = await fromExt("club_champs_matches")
      .update({ scheduled_date: plan.date, scheduled_time: `${s.time}:00`, court_id: s.courtId, play_by: null } as any)
      .eq("id", s.id).is("winner_member_id", null).is("booking_id", null);
    if (error) throw new Error(error.message);
  }
  return { scheduled: plan.slots.length, overflow: plan.overflow, required: plan.required, available: plan.available };
}
export const allocateFixedStage = scheduleFormalStage;

/** Run the allocator for every fixed stage of the tournament (used after any generation path). */
export async function allocateAllFixedStages(champId: string) {
  const steps = (await loadPlanSteps(champId)).filter(isCentrallyScheduled);
  const out: Array<{ label: string; scheduled: number; overflow: string[]; required: number; available: number }> = [];
  for (const s of steps) out.push({ label: s.label, ...(await scheduleFormalStage(champId, s)) });
  return out;
}
