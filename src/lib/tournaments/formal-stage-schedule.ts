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
import { normaliseSchedulingPrefs, planPrefWaves, prefsActive, type SchedulingPrefs } from "./scheduling-prefs";

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
  const out: Array<{ label: string; scheduled: number; overflow: string[]; required: number; available: number; issues?: string[] }> = [];
  for (const s of steps) out.push({ label: s.label, ...(await scheduleFormalStage(champId, s)) });
  // Fixed-date round-robin / cross-league rounds (incl. Bells): timed sessions per round.
  const timed = await scheduleTimedRounds(champId);
  if (timed) out.push(timed);
  return out;
}

/**
 * Is a saved game's slot still valid for ITS OWN stage's resources (date, window, selected courts)?
 * Courts are never inherited from another stage or the club's court list.
 */
export function slotFitsStage(step: FormalStep, m: { scheduled_date?: string | null; scheduled_time?: string | null; court_id?: number | string | null }, minutes = 45) {
  if (!isCentrallyScheduled(step)) return true;
  if (!m.scheduled_time || m.court_id == null || String(m.scheduled_date ?? "").slice(0, 10) !== step.date.slice(0, 10)) return false;
  if (!(step.courtIds ?? []).map(String).includes(String(m.court_id))) return false;
  const t = toMin(m.scheduled_time);
  return t >= toMin(step.from) && t + Math.max(15, minutes) <= toMin(step.to);
}

/**
 * After a stage's resources change in setup: re-slot any fixed stage whose unplayed, unbooked
 * games no longer fit (e.g. a court removed from the Final). Valid stages are left untouched so
 * times already shown to players don't move needlessly. Games that no longer fit anywhere lose
 * their invalid court/time (never kept on a forbidden court) and are reported as overflow.
 */
export async function reconcileFixedStages(champId: string) {
  const steps = (await loadPlanSteps(champId)).filter(isCentrallyScheduled);
  if (!steps.length) return [];
  const [{ data: t }, { data: rows }] = await Promise.all([
    fromExt("tournaments").select("match_duration_minutes").eq("id", champId).maybeSingle(),
    fromExt("club_champs_matches").select("id, stage_label, status, winner_member_id, booking_id, court_id, scheduled_date, scheduled_time").eq("champ_id", champId),
  ]);
  const minutes = Number((t as any)?.match_duration_minutes) || 45;
  const out: Array<{ label: string; scheduled: number; overflow: string[]; required: number; available: number }> = [];
  for (const s of steps) {
    const own = ((rows ?? []) as any[]).filter((m) => normLabel(m.stage_label) === normLabel(s.label) && !m.winner_member_id && !m.booking_id && !TERMINAL.includes(String(m.status ?? "").toLowerCase()));
    if (!own.some((m) => !slotFitsStage(s, m, minutes))) continue;
    const r = await scheduleFormalStage(champId, s);
    if (r.overflow.length) {
      await fromExt("club_champs_matches").update({ scheduled_time: null, court_id: null } as any)
        .in("id", r.overflow).is("winner_member_id", null).is("booking_id", null);
    }
    out.push({ label: s.label, ...r });
  }
  return out;
}

// ───────────────────────── Timed round sessions (Bells / time-capped, fixed dates) ─────────────────────────

export type TimedDay = { date: string; from: string; to: string; courtIds: number[] };
export type TimedRound = { round: number; date?: string | null; games: string[] };
export type TimedSlot = { id: string; date: string; time: string; courtId: number; round: number };

/**
 * Pure planner for fixed-date round sessions. Every game of a round starts at that round's bell
 * on its own court; the next round starts one slot later (slot = the format's match/bell minutes
 * + buffer). With `waves`, a round larger than the court count plays in consecutive waves;
 * without it, too few courts is a capacity issue. Rounds with their own configured date start on
 * that day; others follow sequentially and roll to the next configured day/session when the
 * window is full. All-or-nothing: any issue means nothing should be written.
 */
export function planTimedRounds(o: { rounds: TimedRound[]; days: TimedDay[]; minutes: number; bufferMinutes?: number; busy?: Array<Busy & { date: string }>; waves?: boolean; players?: Record<string, string[]> }) {
  const step = Math.max(1, Number(o.minutes) || 0) + Math.max(0, o.bufferMinutes ?? 0);
  const days = [...o.days].filter((d) => d.courtIds.length && toMin(d.to) > toMin(d.from)).sort((a, b) => a.date.localeCompare(b.date) || toMin(a.from) - toMin(b.from));
  const taken: Array<Busy & { date: string }> = [...(o.busy ?? [])];
  const slots: TimedSlot[] = [];
  const issues: string[] = [];
  const maxCourts = Math.max(0, ...days.map((d) => d.courtIds.length));
  const required = o.rounds.reduce((n, r) => n + r.games.length, 0);
  const available = days.reduce((n, d) => n + Math.floor((toMin(d.to) - toMin(d.from)) / step) * d.courtIds.length, 0);
  if (!days.length) return { slots: [], issues: ["No fixed match date with a time window and courts is configured."], required, available: 0 };
  const freeAt = (d: TimedDay, t: number) => d.courtIds.filter((c) => !taken.some((b) => b.date === d.date && b.courtId === c && toMin(b.start) < t + step && toMin(b.end) > t));
  let di = 0;
  let t = toMin(days[0].from);
  for (const r of [...o.rounds].sort((a, b) => a.round - b.round)) {
    if (!r.games.length) continue;
    if (!o.waves && r.games.length > maxCourts) { issues.push(`Round ${r.round}: ${r.games.length} games start together at the bell but only ${maxCourts} court${maxCourts === 1 ? " is" : "s are"} selected (${r.games.length} needed).`); continue; }
    if (r.date) {
      const k = days.findIndex((d, i) => i >= di && d.date === r.date);
      if (k < 0) { issues.push(`Round ${r.round}: its date ${r.date} has no time window/courts left in the plan.`); continue; }
      if (k !== di) { di = k; t = toMin(days[k].from); }
    }
    let placed = false;
    while (!placed && di < days.length) {
      const d = days[di];
      const waves: string[][] = [];
      const per = o.waves ? d.courtIds.length : r.games.length;
      // A player is never on two courts at once: each wave holds a player at most once.
      for (const id of r.games) {
        const ps = o.players?.[id] ?? [];
        const w = waves.find((x) => x.length < per && !x.some((y) => (o.players?.[y] ?? []).some((p) => ps.includes(p))));
        if (w) w.push(id); else waves.push([id]);
      }
      if (!o.waves && waves.length > 1) { issues.push(`Round ${r.round}: a player appears in two games of the same round, so they cannot all start at the bell.`); break; }
      let cursor = t; const local: TimedSlot[] = []; let ok = true;
      for (const w of waves) {
        let courts = freeAt(d, cursor);
        while (courts.length < w.length && cursor + step <= toMin(d.to)) { cursor += step; courts = freeAt(d, cursor); }
        if (courts.length < w.length || cursor + step > toMin(d.to)) { ok = false; break; }
        w.forEach((id, j) => local.push({ id, date: d.date, time: toHHMM(cursor), courtId: courts[j], round: r.round }));
        cursor += step;
      }
      if (ok) {
        for (const s of local) { slots.push(s); taken.push({ date: s.date, courtId: s.courtId, start: s.time, end: toHHMM(toMin(s.time) + step) }); }
        t = cursor; placed = true;
      } else if (r.date) { break; } else { di++; if (di < days.length) t = toMin(days[di].from); }
    }
    if (!placed) issues.push(`Round ${r.round}: no room left — ${required} games need ${Math.ceil(required / Math.max(1, maxCourts))} bell slot${required > maxCourts ? "s" : ""} on ${maxCourts} court${maxCourts === 1 ? "" : "s"} but only ${available} court slots fit in the configured time window${days.length > 1 ? "s" : ""}.`);
  }
  if (issues.length && required > available) issues.unshift(`${required} games need ${required} court slots but only ${available} fit (${days.map((d) => `${d.date} ${d.from}–${d.to} on ${d.courtIds.length} court${d.courtIds.length === 1 ? "" : "s"}`).join("; ")}, ${step} min per game).`);
  return { slots: issues.length ? [] : slots, issues, required, available };
}

/**
 * Bells / time-capped packing: a bell slot is a WAVE of up to N games on the N courts free at that
 * time; a logical round may span several waves. Games are taken in round order, skipping any game
 * whose players are already in the wave (no player on two courts at once). Waves advance by the
 * bell slot (cap + changeover) and roll across the configured days. Capacity is reported only after
 * packing into every configured date/window/court. All-or-nothing.
 */
export function planBellsWaves(o: { rounds: TimedRound[]; days: TimedDay[]; minutes: number; bufferMinutes?: number; busy?: Array<Busy & { date: string }>; players?: Record<string, string[]> }) {
  const step = Math.max(1, Number(o.minutes) || 0) + Math.max(0, o.bufferMinutes ?? 0);
  const days = [...o.days].filter((d) => d.courtIds.length && toMin(d.to) > toMin(d.from)).sort((a, b) => a.date.localeCompare(b.date) || toMin(a.from) - toMin(b.from));
  const queue = [...o.rounds].sort((a, b) => a.round - b.round).flatMap((r) => r.games.map((id) => ({ id, round: r.round })));
  const required = queue.length;
  const busy = o.busy ?? [];
  let available = 0;
  const slots: TimedSlot[] = [];
  for (const d of days) {
    for (let t = toMin(d.from); t + step <= toMin(d.to); t += step) {
      const courts = d.courtIds.filter((c) => !busy.some((b) => b.date === d.date && b.courtId === c && toMin(b.start) < t + step && toMin(b.end) > t));
      available += courts.length;
      const inWave = new Set<string>();
      let ci = 0;
      for (let i = 0; i < queue.length && ci < courts.length; ) {
        const ps = o.players?.[queue[i].id] ?? [];
        if (ps.some((p) => inWave.has(p))) { i++; continue; }
        ps.forEach((p) => inWave.add(p));
        slots.push({ id: queue[i].id, date: d.date, time: toHHMM(t), courtId: courts[ci++], round: queue[i].round });
        queue.splice(i, 1);
      }
    }
  }
  if (!days.length) return { slots: [], issues: ["No fixed match date with a time window and courts is configured."], required, available: 0 };
  const issues = queue.length ? [`${required} games need a bell slot but only ${required - queue.length} could be placed (${available} court slots: ${days.map((d) => `${d.date} ${d.from}–${d.to} on ${d.courtIds.length} court${d.courtIds.length === 1 ? "" : "s"}`).join("; ")}, ${step} min per bell, no player on two courts at once). ${queue.length} game${queue.length === 1 ? "" : "s"} left over.`] : [];
  return { slots: issues.length ? [] : slots, issues, required, available };
}

/** Bells/time-capped slot minutes from the synced plan (play + changeover, else the legacy cap). */
export function bellsSlotMinutes(scoring: any): number | null {
  if (scoring?.mode !== "time_capped_points") return null;
  const play = Number(scoring.timeCapPlay);
  if (Number.isFinite(play) && play > 0) return play + Math.max(0, Number(scoring.timeCapBreak) || 0);
  const cap = Number(scoring.timeCapMinutes);
  return Number.isFinite(cap) && cap > 0 ? cap : null;
}

/** Fixed-date sessions from the plan (`format_plan.days[].windows`, each day's own selected courts). */
export function planDays(formatPlan: any): TimedDay[] {
  const out: TimedDay[] = [];
  for (const d of (formatPlan?.days ?? []) as any[]) {
    const courtIds = ((d?.courtIds ?? []) as any[]).map(Number).filter(Number.isFinite);
    for (const w of (d?.windows ?? []) as any[]) if (d?.date && w?.from && w?.to) out.push({ date: String(d.date).slice(0, 10), from: String(w.from).slice(0, 5), to: String(w.to).slice(0, 5), courtIds });
  }
  return out;
}

/** One game the timed scheduler places (same shape for the pre-generation preview and live games). */
export type TimedGame = { id: string; round: number; group: number; bracket: number; people: string[]; groups: number[] };

/** Everything the timed scheduler reads from the tournament — loaded once, shared by preview and allocation. */
export type TimedContext = {
  days: TimedDay[]; minutes: number; bells: boolean; waves: boolean; roundDates: string[];
  prefs: SchedulingPrefs; labels: Record<string, string>; entryGroup: Map<string, number>;
  /** Court occupancy on the plan's dates/courts, excluding this tournament's own games. */
  busyOther: Array<Busy & { date: string }>;
  fixedStages: boolean;
};

export async function loadTimedContext(champId: string): Promise<TimedContext | null> {
  const [{ data: t }, { data: entries }] = await Promise.all([
    fromExt("tournaments").select("builder_spec, beta_lifecycle, group_labels, match_duration_minutes, rules:tournament_rules(scoring_mode)").eq("id", champId).maybeSingle(),
    fromExt("club_champs_entries").select("club_member_id, partner_member_id, group_number").eq("champ_id", champId),
  ]);
  if (!t) return null;
  const spec: any = (t as any).builder_spec;
  const plan: any = (t as any).beta_lifecycle?.format_plan;
  const fixed = ((spec?.divisions ?? []) as any[]).flatMap((d) => d.stages ?? []).filter((s: any) => s?.schedule?.rule === "fixed" && s.kind !== "knockout");
  const days = planDays(plan);
  const rulesMode = ([] as any[]).concat((t as any).rules ?? [])[0]?.scoring_mode;
  const bells = plan?.scoring?.mode === "time_capped_points" || rulesMode === "time_capped_points";
  const minutes = (bells ? bellsSlotMinutes(plan?.scoring) : null) ?? (Number((t as any).match_duration_minutes) || 30);
  const entryGroup = new Map<string, number>();
  for (const e of (entries ?? []) as any[]) { entryGroup.set(e.club_member_id, Number(e.group_number)); if (e.partner_member_id) entryGroup.set(e.partner_member_id, Number(e.group_number)); }
  const dates = Array.from(new Set(days.map((d) => d.date)));
  const courts = Array.from(new Set(days.flatMap((d) => d.courtIds)));
  let busyOther: Array<Busy & { date: string }> = [];
  if (dates.length && courts.length) {
    const [{ data: dayGames }, { data: bk }] = await Promise.all([
      fromExt("club_champs_matches").select("id, champ_id, court_id, scheduled_date, scheduled_time").in("scheduled_date", dates).in("court_id", courts),
      fromExt("bookings").select("court_id, date, start_time, end_time, external_id").in("date", dates).eq("status", "active").in("court_id", courts),
    ]);
    busyOther = [
      ...((dayGames ?? []) as any[]).filter((m) => m.champ_id !== champId && m.scheduled_time).map((m) => ({ date: String(m.scheduled_date).slice(0, 10), courtId: Number(m.court_id), start: String(m.scheduled_time).slice(0, 5), end: toHHMM(toMin(m.scheduled_time) + minutes) })),
      ...((bk ?? []) as any[]).filter((b) => !String(b.external_id ?? "").startsWith("sbs:")).map((b) => ({ date: String(b.date).slice(0, 10), courtId: Number(b.court_id), start: String(b.start_time).slice(0, 5), end: String(b.end_time).slice(0, 5) })),
    ];
  }
  return {
    days, minutes, bells, waves: !!plan?.waves, fixedStages: fixed.length > 0,
    roundDates: ((fixed[0]?.schedule?.roundDates ?? []) as string[]).map((x) => String(x).slice(0, 10)),
    prefs: normaliseSchedulingPrefs((t as any).beta_lifecycle?.scheduling_prefs),
    labels: ((t as any).group_labels ?? {}) as Record<string, string>, entryGroup, busyOther,
  };
}

/** Preferences apply only where games pack into court-sized waves (Bells/time-capped, or waves enabled). */
export const prefsApplicable = (ctx: Pick<TimedContext, "bells" | "waves">) => ctx.bells || ctx.waves;

/**
 * THE timed planner used by both the Generate Draw & Fixtures preview and the real allocation.
 * Default preferences (No restriction + Any court) run the exact pre-existing planners unchanged.
 */
export function planTimedSchedule(ctx: Omit<TimedContext, "entryGroup" | "fixedStages">, games: TimedGame[], extraBusy: Array<Busy & { date: string }> = []) {
  const sorted = [...games].sort((a, b) => a.round - b.round || a.group - b.group || a.bracket - b.bracket);
  const busy = [...ctx.busyOther, ...extraBusy];
  const keyOf = (g: number) => ctx.labels[String(g)];
  if (prefsActive(ctx.prefs) && prefsApplicable(ctx)) {
    return planPrefWaves({ games: sorted.map((g) => ({ id: g.id, round: g.round, people: g.people, groups: g.groups })), days: ctx.days, minutes: ctx.minutes, busy, prefs: ctx.prefs, keyOf });
  }
  const byRound = new Map<number, string[]>();
  for (const g of sorted) byRound.set(g.round, [...(byRound.get(g.round) ?? []), g.id]);
  const rounds: TimedRound[] = [...byRound.entries()].map(([round, ids]) => ({ round, date: ctx.roundDates.length > 1 ? ctx.roundDates[round - 1] ?? null : null, games: ids }));
  const players = Object.fromEntries(sorted.map((g) => [g.id, g.people]));
  const r = ctx.bells ? planBellsWaves({ rounds, days: ctx.days, minutes: ctx.minutes, busy, players }) : planTimedRounds({ rounds, days: ctx.days, minutes: ctx.minutes, busy, waves: ctx.waves, players });
  return { ...r, notes: [] as string[], backToBack: 0 };
}

/** Saved game → TimedGame (people include doubles partners; categories from each side's entry group). */
export function timedGameFromRow(m: any, entryGroup: Map<string, number>): TimedGame {
  const people = [m.player_a_member_id, m.partner_a_member_id, m.player_b_member_id, m.partner_b_member_id].filter(Boolean);
  const groups = [...new Set([entryGroup.get(m.player_a_member_id), entryGroup.get(m.player_b_member_id)].filter((g): g is number => g != null))];
  return { id: m.id, round: Number(m.round_number) || 1, group: Number(m.group_number) || 0, bracket: Number(m.bracket_position) || 0, people, groups: groups.length ? groups : [Number(m.group_number) || 0] };
}

/**
 * Schedule every unplayed, unbooked game of the tournament's FIXED-date (non-formal) stages into
 * timed sessions via `planTimedSchedule` (honouring saved scheduling preferences). Writes nothing
 * when the plan does not fit. Played/started/booked games are never moved; they block their slots.
 */
export async function scheduleTimedRounds(champId: string, opts: { dryRun?: boolean } = {}) {
  const ctx = await loadTimedContext(champId);
  if (!ctx || !ctx.fixedStages || !ctx.days.length) return null;
  const [{ data: rows }, steps] = await Promise.all([
    fromExt("club_champs_matches").select("id, round_number, group_number, bracket_position, status, winner_member_id, booking_id, court_id, scheduled_date, scheduled_time, stage_label, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id").eq("champ_id", champId),
    loadPlanSteps(champId),
  ]);
  const movable = (m: any) => !m.winner_member_id && !m.booking_id && !TERMINAL.includes(String(m.status ?? "").toLowerCase()) && m.player_a_member_id && m.player_b_member_id;
  const all = (rows ?? []) as any[];
  const own = all.filter((m) => movable(m) && !findStep(steps, String(m.stage_label ?? "")));
  if (!own.length) return { label: "Round robin", scheduled: 0, overflow: [], required: 0, available: 0, issues: [] as string[], notes: [] as string[] };
  const ownIds = new Set(own.map((m) => m.id));
  // This tournament's fixed (played/booked/other-stage) games keep their slots.
  const keep = all.filter((m) => !ownIds.has(m.id) && m.scheduled_time && m.court_id).map((m) => ({ date: String(m.scheduled_date).slice(0, 10), courtId: Number(m.court_id), start: String(m.scheduled_time).slice(0, 5), end: toHHMM(toMin(m.scheduled_time) + ctx.minutes) }));
  const res = planTimedSchedule(ctx, own.map((m) => timedGameFromRow(m, ctx.entryGroup)), keep);
  for (const s of opts.dryRun ? [] : res.slots) {
    const { error } = await fromExt("club_champs_matches")
      .update({ scheduled_date: s.date, scheduled_time: `${s.time}:00`, court_id: s.courtId, play_by: null } as any)
      .eq("id", s.id).is("winner_member_id", null).is("booking_id", null);
    if (error) throw new Error(error.message);
  }
  return { label: "Round robin", scheduled: res.slots.length, overflow: res.issues.length ? own.map((m) => m.id) : [], required: res.required, available: res.available, issues: res.issues, notes: res.notes };
}
