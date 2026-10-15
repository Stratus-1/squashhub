/**
 * Changing the scheduling of an EXISTING round (timed court/date/time <-> Play by date).
 * Never redraws pairings, never touches results or confirmed players.
 * - Play by date: server `admin_set_round_play_by` sets the deadline on the round and its open matches and releases only
 *   each match's own allocation booking (tournament block holds are restored, never cancelled).
 * - Timed: server `admin_set_round_timed`, then each confirmed, unscheduled match is placed in a free slot inside a
 *   tournament block reservation via the existing `self_schedule_champ_match` (server re-validates and carves the hold).
 *   Individually named bookings are never used or moved. A shortage is reported, never downgraded to play-by.
 */
import { supabase } from "@/integrations/supabase/client";

export interface SlotBooking {
  id: string; court_id: number; start_time: string; end_time: string; status?: string | null;
  external_booker_name?: string | null; external_id?: string | null;
  user_id?: string | null; club_member_id?: string | null; opponent_id?: string | null; opponent_member_id?: string | null;
}
export interface SlotMatch { id: string; players: string[] }
export interface TimedWindow { date: string; from: string; to: string; minutes: number; courtIds: number[] }
export interface Allocation { assign: Array<{ matchId: string; courtId: number; time: string }>; unplaced: Array<{ matchId: string; reason: string }> }

const mins = (t: string) => { const [h, m] = String(t).slice(0, 5).split(":").map(Number); return h * 60 + m; };
const hm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const named = (b: SlotBooking) => !!(b.user_id || b.club_member_id || b.opponent_id || b.opponent_member_id);
/** Tournament block reservation: a club hold without any individual name (legacy "Club Championship…" or sbs: plan block). */
export const isTournamentHold = (b: SlotBooking) =>
  !named(b) && (/^\s*club championship/i.test(b.external_booker_name ?? "") || String(b.external_id ?? "").startsWith("sbs:"));

/** Pure greedy allocation into tournament block slots (earliest time first, then court). */
export function allocateRoundSlots(matches: SlotMatch[], w: TimedWindow, bookings: SlotBooking[]): Allocation {
  const active = bookings.filter((b) => (b.status ?? "active") === "active");
  const courts = new Set(w.courtIds.map(Number));
  const from = mins(w.from), to = mins(w.to), len = Math.max(15, w.minutes);
  const holds = active.filter((b) => isTournamentHold(b) && courts.has(Number(b.court_id)));
  const others = active.filter((b) => !isTournamentHold(b));
  const slots: Array<{ court: number; t: number }> = [];
  for (const h of holds) {
    for (let t = Math.max(mins(h.start_time), from); t + len <= Math.min(mins(h.end_time), to); t += len) slots.push({ court: Number(h.court_id), t });
  }
  const seen = new Set<string>();
  const uniq = slots.filter((s) => { const k = `${s.court}@${s.t}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.t - b.t || a.court - b.court);
  const overlaps = (b: { s: number; e: number }, t: number) => b.s < t + len && b.e > t;
  const courtBusy = (c: number, t: number) => others.some((b) => Number(b.court_id) === c && overlaps({ s: mins(b.start_time), e: mins(b.end_time) }, t));
  const playerBusy = (ids: string[], t: number) => others.some((b) => [b.club_member_id, b.opponent_member_id].some((x) => x && ids.includes(x)) && overlaps({ s: mins(b.start_time), e: mins(b.end_time) }, t));
  const used: Array<{ court: number; t: number; players: string[] }> = [];
  const out: Allocation = { assign: [], unplaced: [] };
  if (!holds.length) {
    for (const m of matches) out.unplaced.push({ matchId: m.id, reason: "No tournament block reservation on the chosen courts and date" });
    return out;
  }
  for (const m of matches) {
    const slot = uniq.find((s) => !courtBusy(s.court, s.t) && !playerBusy(m.players, s.t)
      && !used.some((u) => (u.court === s.court && Math.abs(u.t - s.t) < len) || (Math.abs(u.t - s.t) < len && u.players.some((p) => m.players.includes(p)))));
    if (!slot) { out.unplaced.push({ matchId: m.id, reason: "No free block slot left in the window" }); continue; }
    used.push({ court: slot.court, t: slot.t, players: m.players });
    out.assign.push({ matchId: m.id, courtId: slot.court, time: hm(slot.t) });
  }
  return out;
}

export async function switchRoundToPlayBy(roundId: string, playBy: string) {
  const { data, error } = await (supabase as any).rpc("admin_set_round_play_by", { p_round_id: roundId, p_play_by: playBy });
  if (error) throw error;
  return data as { matches: number; released: number; notified: number };
}

export async function switchRoundToTimed(roundId: string, w: TimedWindow) {
  const { error } = await (supabase as any).rpc("admin_set_round_timed", { p_round_id: roundId });
  if (error) throw error;
  const { data: ms, error: me } = await (supabase as any).from("club_champs_matches")
    .select("id, champ_id, status, is_bye, booking_id, scheduled_date, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id")
    .eq("round_id", roundId);
  if (me) throw me;
  // Only confirmed (both players known), open, not-yet-placed matches; provisional slots are never booked.
  const open = ((ms ?? []) as any[]).filter((m) => !m.is_bye && m.player_a_member_id && m.player_b_member_id && !m.booking_id && !m.scheduled_date
    && !["completed", "in_progress", "forfeited", "walkover", "cancelled"].includes(m.status ?? ""));
  const { data: bk, error: be } = await (supabase as any).from("bookings")
    .select("id, court_id, start_time, end_time, status, external_booker_name, external_id, user_id, club_member_id, opponent_id, opponent_member_id")
    .eq("date", w.date).eq("status", "active");
  if (be) throw be;
  const plan = allocateRoundSlots(open.map((m) => ({ id: m.id, players: [m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id].filter(Boolean) })), w, (bk ?? []) as SlotBooking[]);
  let booked = 0;
  const unplaced = [...plan.unplaced];
  for (const a of plan.assign) {
    const { error: se } = await (supabase as any).rpc("self_schedule_champ_match", { p_match_id: a.matchId, p_court_id: a.courtId, p_date: w.date, p_time: a.time, p_duration_minutes: w.minutes });
    if (se) unplaced.push({ matchId: a.matchId, reason: se.message }); else booked += 1;
  }
  return { booked, unplaced, eligible: open.length };
}
