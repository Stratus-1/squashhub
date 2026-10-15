/**
 * Round SCHEDULE management for existing rounds — separate from DRAW generation (pairings).
 * Nothing here creates, removes or re-pairs matches, edits results or unlocks confirmed pairings.
 *
 * Saved settings live on `beta_lifecycle.format_plan.stages[]` (mode "scheduled" | "play_by", date/from/to/courtIds,
 * extraDays, deadline). The live round rows (`club_champs_rounds`) and their matches are reconciled to those settings:
 * - Play by date: server `admin_set_round_play_by` (idempotent) sets the deadline, clears unbooked allocations and
 *   organiser-made match bookings (block holds restored), keeps players' own bookings and every other booking.
 * - Scheduled: a conflict-aware PROPOSAL is built (no writes), previewed, and only after approval applied through
 *   `admin_set_round_timed` + `self_schedule_champ_match` (server re-validates courts/clashes, carves block holds).
 * Matches without both players (provisional) are never allocated and stay out of Upcoming Fixtures.
 */
import { supabase } from "@/integrations/supabase/client";

export interface SlotBooking {
  id: string; court_id: number; date?: string; start_time: string; end_time: string; status?: string | null;
  external_booker_name?: string | null; external_id?: string | null;
  user_id?: string | null; club_member_id?: string | null; opponent_id?: string | null; opponent_member_id?: string | null;
}
export interface SlotMatch { id: string; players: string[] }
export interface TimedWindow { date: string; from: string; to: string; minutes: number; courtIds: number[] }
export type SlotSource = "block" | "unreserved";
export interface Allocation {
  assign: Array<{ matchId: string; courtId: number; date: string; time: string; source: SlotSource }>;
  unplaced: Array<{ matchId: string; reason: string }>;
}

const mins = (t: string) => { const [h, m] = String(t).slice(0, 5).split(":").map(Number); return h * 60 + m; };
const hm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export const isNamedBooking = (b: SlotBooking) => !!(b.user_id || b.club_member_id || b.opponent_id || b.opponent_member_id);
/** Tournament block reservation: a hold without any individual name (legacy "Club Championship…" or sbs: plan block). */
const normName = (x: string | null | undefined) => String(x ?? "").replace(/^\s*\d+\s*;\s*/, "").trim().toLowerCase().replace(/\s+/g, " ");
export const isTournamentHold = (b: SlotBooking, blockName?: string | null) =>
  !isNamedBooking(b) && (blockName?.trim()
    ? normName(b.external_booker_name) === normName(blockName) || String(b.external_id ?? "").startsWith("sbs:")
    : /^\s*club championship/i.test(b.external_booker_name ?? "") || String(b.external_id ?? "").startsWith("sbs:"));

/** Join touching/overlapping hold rows per court (GoBook stores a block as consecutive 45-min rows) so games can span row boundaries. */
export function mergeHolds(holds: SlotBooking[]): Array<{ court: number; start: number; end: number }> {
  const by = new Map<number, Array<{ start: number; end: number }>>();
  for (const h of holds) { const c = Number(h.court_id); (by.get(c) ?? by.set(c, []).get(c)!).push({ start: mins(h.start_time), end: mins(h.end_time) }); }
  const out: Array<{ court: number; start: number; end: number }> = [];
  for (const [court, xs] of by) {
    xs.sort((a, b) => a.start - b.start);
    for (const x of xs) { const last = out[out.length - 1]; if (last && last.court === court && x.start <= last.end) last.end = Math.max(last.end, x.end); else out.push({ court, ...x }); }
  }
  return out;
}

/**
 * Pure greedy allocation across one or more windows. Block-hold slots are preferred; free (unbooked) court time
 * inside the window is used next and labelled "unreserved". Named/external bookings are never used.
 */
export function allocateRoundSlots(matches: SlotMatch[], windows: TimedWindow | TimedWindow[], bookings: SlotBooking[], opts: { allowUnreserved?: boolean; blockName?: string | null } = {}): Allocation {
  const ws = Array.isArray(windows) ? windows : [windows];
  const active = bookings.filter((b) => (b.status ?? "active") === "active");
  const slots: Array<{ date: string; court: number; t: number; len: number; source: SlotSource }> = [];
  for (const w of ws) {
    const len = Math.max(15, w.minutes), from = mins(w.from), to = mins(w.to);
    const courts = new Set(w.courtIds.map(Number));
    const onDay = active.filter((b) => !b.date || b.date === w.date);
    const holds = mergeHolds(onDay.filter((b) => isTournamentHold(b, opts.blockName) && courts.has(Number(b.court_id))));
    for (const h of holds) for (let t = Math.max(h.start, from); t + len <= Math.min(h.end, to); t += len) slots.push({ date: w.date, court: h.court, t, len, source: "block" });
    if (opts.allowUnreserved) for (const c of courts) for (let t = from; t + len <= to; t += len) {
      if (!onDay.some((b) => Number(b.court_id) === c && mins(b.start_time) < t + len && mins(b.end_time) > t)) slots.push({ date: w.date, court: c, t, len, source: "unreserved" });
    }
  }
  const seen = new Set<string>();
  const uniq = slots.filter((s) => { const k = `${s.date}|${s.court}@${s.t}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (a.source === b.source ? 0 : a.source === "block" ? -1 : 1) || a.date.localeCompare(b.date) || a.t - b.t || a.court - b.court);
  const others = active.filter((b) => !isTournamentHold(b, opts.blockName));
  const ov = (s: number, e: number, t: number, len: number) => s < t + len && e > t;
  const courtBusy = (d: string, c: number, t: number, len: number) => others.some((b) => (!b.date || b.date === d) && Number(b.court_id) === c && ov(mins(b.start_time), mins(b.end_time), t, len));
  const playerBusy = (d: string, ids: string[], t: number, len: number) => others.some((b) => (!b.date || b.date === d) && [b.club_member_id, b.opponent_member_id].some((x) => x && ids.includes(x)) && ov(mins(b.start_time), mins(b.end_time), t, len));
  const used: Array<{ date: string; court: number; t: number; len: number; players: string[] }> = [];
  const out: Allocation = { assign: [], unplaced: [] };
  if (!uniq.length) {
    for (const m of matches) out.unplaced.push({ matchId: m.id, reason: "No tournament block slot (or free court time) in the saved windows" });
    return out;
  }
  for (const m of matches) {
    const slot = uniq.find((s) => !courtBusy(s.date, s.court, s.t, s.len) && !playerBusy(s.date, m.players, s.t, s.len)
      && !used.some((u) => u.date === s.date && ov(u.t, u.t + u.len, s.t, s.len) && (u.court === s.court || u.players.some((p) => m.players.includes(p)))));
    if (!slot) { out.unplaced.push({ matchId: m.id, reason: "No free slot left in the saved windows" }); continue; }
    used.push({ date: slot.date, court: slot.court, t: slot.t, len: slot.len, players: m.players });
    out.assign.push({ matchId: m.id, courtId: slot.court, date: slot.date, time: hm(slot.t), source: slot.source });
  }
  return out;
}

/* ---------------- saved settings <-> live rounds ---------------- */

export interface StageSchedule { id: string; name: string; index: number; mode: "scheduled" | "play_by"; deadline: string | null; windows: Omit<TimedWindow, "minutes">[] }
export interface LiveRound { id: string; label: string | null; round_number: number; scheduling_mode: string | null; play_by: string | null; group_number: number | null }
export interface LiveMatch {
  id: string; round_id: string | null; status: string | null; is_bye: boolean | null; booking_id: string | null;
  scheduled_date: string | null; scheduled_time: string | null; court_id: number | null; play_by: string | null;
  player_a_member_id: string | null; player_b_member_id: string | null; partner_a_member_id?: string | null; partner_b_member_id?: string | null;
}

/** Main-phase stage schedules from the saved format plan. */
export function stageSchedules(formatPlan: any): StageSchedule[] {
  const stages = ((formatPlan?.stages ?? []) as any[]).filter((s) => (s.phase ?? "main") === "main");
  return stages.map((s, i) => ({
    id: String(s.id ?? i), name: String(s.name ?? `Round ${i + 1}`), index: i,
    mode: s.mode === "play_by" ? "play_by" : "scheduled",
    deadline: s.deadline || null,
    windows: [{ date: s.date, from: s.from, to: s.to, courtIds: (s.courtIds ?? []).map(Number) }, ...((s.extraDays ?? []) as any[]).map((d) => ({ date: d.date, from: d.from, to: d.to, courtIds: (d.courtIds ?? s.courtIds ?? []).map(Number) }))]
      .filter((w) => w.date && w.from && w.to && w.courtIds.length),
  }));
}

/** Live round rows (every category) belonging to a saved stage: label match first, else round number = position. */
export function roundsForStage(stage: StageSchedule, rounds: LiveRound[]): LiveRound[] {
  const norm = (s: string | null) => String(s ?? "").trim().toLowerCase();
  const byLabel = rounds.filter((r) => norm(r.label) === norm(stage.name));
  return byLabel.length ? byLabel : rounds.filter((r) => !r.label && r.round_number === stage.index + 1);
}

const TERMINAL = ["completed", "in_progress", "forfeited", "walkover", "cancelled"];
export const isOpen = (m: LiveMatch) => !m.is_bye && !TERMINAL.includes(m.status ?? "");
export const isConfirmed = (m: LiveMatch) => !!(m.player_a_member_id && m.player_b_member_id);

export interface ReconcileDiff {
  mode: "scheduled" | "play_by";
  roundsToUpdate: string[];
  clearAllocations: string[];      // play_by: open matches whose court/time will be removed
  keepPlayerBookings: string[];    // play_by: players' own bookings that stay
  deadlineUpdates: string[];       // play_by: open matches whose deadline changes
  needAllocation: string[];        // scheduled: confirmed open matches with no slot yet
  outsideWindow: string[];         // scheduled: organiser allocations no longer inside the saved date/time/courts
  provisional: number;             // never allocated, hidden from Upcoming
  untouched: number;               // completed/live/bye
  inSync: boolean;
}

/** Is an allocated match inside one of the saved windows (date, start time, court)? Unknown parts never fail it. */
export function insideWindows(m: Pick<LiveMatch, "scheduled_date" | "scheduled_time" | "court_id">, windows: StageSchedule["windows"]): boolean {
  if (!windows.length) return true;
  return windows.some((w) => w.date === m.scheduled_date
    && (!m.scheduled_time || (mins(m.scheduled_time) >= mins(w.from) && mins(m.scheduled_time) < mins(w.to)))
    && (m.court_id == null || w.courtIds.map(Number).includes(Number(m.court_id))));
}

/** Stable signature of a stage's schedule settings — equal signatures mean nothing meaningful changed. */
export const stageSignature = (s: StageSchedule) => JSON.stringify([s.mode, s.mode === "play_by" ? s.deadline : null, s.mode === "scheduled" ? s.windows.map((w) => [w.date, w.from, w.to, [...w.courtIds].sort()]) : null]);

/** Pure dry-run: what "Save & Apply" / "Refresh Fixtures & Log" would change. */
export function diffRound(stage: StageSchedule, rounds: LiveRound[], matches: LiveMatch[]): ReconcileDiff {
  const d: ReconcileDiff = { mode: stage.mode, roundsToUpdate: [], clearAllocations: [], keepPlayerBookings: [], deadlineUpdates: [], needAllocation: [], outsideWindow: [], provisional: 0, untouched: 0, inSync: true };
  const ids = new Set(rounds.map((r) => r.id));
  for (const r of rounds) {
    const want = stage.mode === "play_by" ? "self" : "club";
    if ((r.scheduling_mode ?? "self") !== want || (stage.mode === "play_by" && r.play_by !== stage.deadline)) d.roundsToUpdate.push(r.id);
  }
  const wasClub = new Map(rounds.map((r) => [r.id, r.scheduling_mode === "club"]));
  for (const m of matches.filter((x) => x.round_id && ids.has(x.round_id))) {
    if (!isOpen(m)) { d.untouched++; continue; }
    if (stage.mode === "play_by") {
      if (m.booking_id && !wasClub.get(m.round_id!)) d.keepPlayerBookings.push(m.id);
      else if (m.booking_id || m.scheduled_date || m.scheduled_time || m.court_id) d.clearAllocations.push(m.id);
      if (m.play_by !== stage.deadline) d.deadlineUpdates.push(m.id);
    } else if (!isConfirmed(m)) d.provisional++;
    else if (!m.scheduled_date && !m.booking_id) d.needAllocation.push(m.id);
    else if (wasClub.get(m.round_id!) && !insideWindows(m, stage.windows)) d.outsideWindow.push(m.id);
  }
  d.inSync = !d.roundsToUpdate.length && !d.clearAllocations.length && !d.deadlineUpdates.length && !d.needAllocation.length && !d.outsideWindow.length;
  return d;
}

/* ---------------- I/O ---------------- */

const db = supabase as any;

export async function loadRoundState(tournamentId: string) {
  const [{ data: t }, { data: rounds }, { data: matches }] = await Promise.all([
    db.from("tournaments").select("beta_lifecycle").eq("id", tournamentId).maybeSingle(),
    db.from("club_champs_rounds").select("id, label, round_number, scheduling_mode, play_by, group_number").eq("champ_id", tournamentId).order("round_number"),
    db.from("club_champs_matches").select("id, round_id, status, is_bye, booking_id, scheduled_date, scheduled_time, court_id, play_by, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id").eq("champ_id", tournamentId),
  ]);
  const plan = (t as any)?.beta_lifecycle?.format_plan ?? null;
  return { lifecycle: (t as any)?.beta_lifecycle ?? null, plan, minutes: Number(plan?.scheduling?.singles) || 45, blockName: (plan?.scheduling?.blockName as string | undefined)?.trim() || null, stages: stageSchedules(plan), rounds: (rounds ?? []) as LiveRound[], matches: (matches ?? []) as LiveMatch[] };
}

/** Persist edited stage settings in the saved plan (settings only — no fixtures touched here). */
export async function saveStageSettings(tournamentId: string, stageId: string, patch: Record<string, unknown>) {
  const { data, error } = await db.from("tournaments").select("beta_lifecycle").eq("id", tournamentId).maybeSingle();
  if (error) throw error;
  const l = (data as any)?.beta_lifecycle;
  if (!l?.format_plan?.stages) throw new Error("This tournament has no saved round settings");
  const stages = (l.format_plan.stages as any[]).map((s) => (String(s.id) === stageId ? { ...s, ...patch } : s));
  const { error: ue } = await db.from("tournaments").update({ beta_lifecycle: { ...l, format_plan: { ...l.format_plan, stages } } }).eq("id", tournamentId);
  if (ue) throw ue;
}

/** Apply Play by date to every live round of the stage (idempotent server-side). */
export async function applyPlayBy(rounds: LiveRound[], deadline: string) {
  const total = { matches: 0, released: 0, kept_player_bookings: 0, notified: 0 };
  for (const r of rounds) {
    const { data, error } = await db.rpc("admin_set_round_play_by", { p_round_id: r.id, p_play_by: deadline });
    if (error) throw error;
    for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += Number((data as any)?.[k] ?? 0);
  }
  return total;
}

/** One round per week: keep only windows inside the 7 days ending on the round's play-by date (none set = all). */
export function windowsInRoundWeek<W extends { date: string }>(windows: W[], playBy: string | null | undefined): W[] {
  if (!playBy) return windows;
  const end = new Date(`${playBy.slice(0, 10)}T00:00:00Z`);
  const start = new Date(end.getTime() - 6 * 86400000).toISOString().slice(0, 10);
  return windows.filter((w) => w.date >= start && w.date <= playBy.slice(0, 10));
}

/** Build a timed proposal (NO writes). */
export async function proposeTimed(stage: StageSchedule, rounds: LiveRound[], matches: LiveMatch[], minutes: number, blockName?: string | null): Promise<Allocation> {
  const ids = new Set(rounds.map((r) => r.id));
  const club = new Map(rounds.map((r) => [r.id, r.scheduling_mode === "club"]));
  const need = matches.filter((m) => m.round_id && ids.has(m.round_id) && isOpen(m) && isConfirmed(m)
    && ((!m.scheduled_date && !m.booking_id) || (club.get(m.round_id) && !!m.scheduled_date && !insideWindows(m, stage.windows))));
  const moving = new Set(need.map((m) => m.id));
  const deadlines = rounds.map((r) => r.play_by).filter(Boolean).map((d) => String(d).slice(0, 10)).sort();
  const windows = windowsInRoundWeek(stage.windows, deadlines[0] ?? null);
  const dates = [...new Set(windows.map((w) => w.date))];
  const { data: bk, error } = dates.length
    ? await db.from("bookings").select("id, court_id, date, start_time, end_time, status, external_booker_name, external_id, user_id, club_member_id, opponent_id, opponent_member_id").in("date", dates).eq("status", "active")
    : { data: [], error: null };
  if (error) throw error;
  const ownBookings = new Set(need.map((m) => m.booking_id).filter(Boolean));
  // Existing allocations of this tournament on those days also occupy courts/players.
  const taken: SlotBooking[] = matches.filter((m) => m.scheduled_date && dates.includes(m.scheduled_date) && m.court_id && m.scheduled_time && !m.booking_id && isOpen(m) && !moving.has(m.id))
    .map((m) => ({ id: `m:${m.id}`, court_id: Number(m.court_id), date: m.scheduled_date!, start_time: m.scheduled_time!, end_time: hm(mins(m.scheduled_time!) + minutes), club_member_id: m.player_a_member_id, opponent_member_id: m.player_b_member_id }));
  return allocateRoundSlots(
    need.map((m) => ({ id: m.id, players: [m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id].filter(Boolean) as string[] })),
    windows.map((w) => ({ ...w, minutes })), [...((bk ?? []) as SlotBooking[]).filter((b) => !ownBookings.has(b.id)), ...taken], { allowUnreserved: !blockName, blockName });
}

/** Apply an APPROVED proposal. */
export async function applyTimed(rounds: LiveRound[], proposal: Allocation, minutes: number) {
  for (const r of rounds) {
    const { error } = await db.rpc("admin_set_round_timed", { p_round_id: r.id });
    if (error) throw error;
  }
  let booked = 0; const failed: Array<{ matchId: string; reason: string }> = [];
  for (const a of proposal.assign) {
    const { error } = await db.rpc("self_schedule_champ_match", { p_match_id: a.matchId, p_court_id: a.courtId, p_date: a.date, p_time: a.time, p_duration_minutes: minutes, p_fill_hold: false });
    if (error) failed.push({ matchId: a.matchId, reason: error.message }); else booked++;
  }
  return { booked, failed };
}
