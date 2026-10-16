/**
 * Weekend (timed) tournaments: knockout play-off games go into the tournament's own playing days,
 * courts and times, starting straight after the last game of the stage before. Each knockout round
 * starts only after the previous round's games have finished. Games are booked through
 * `self_schedule_champ_match` (same path as "Book court": clash checks, booking row). Idempotent:
 * games that already have a court/booking/result are never moved.
 */
import { fromExt, rpcExt } from "@/lib/supabase-ext";
import { loadTimedContext, type TimedDay, type Busy } from "./formal-stage-schedule";

const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(":").map(Number); return h * 60 + (m || 0); };
const toHHMM = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

export type PlayoffGame = { id: string; round: number; order: number };
export type PlayoffSlot = { id: string; date: string; time: string; courtId: number };

/**
 * Pure planner. `after` = when the previous stage (or previous knockout round) ends. Rounds are
 * placed in order; a round never starts before every game of the round before it has ended.
 */
export function planPlayoffsAfter(o: { days: TimedDay[]; minutes: number; after: { date: string; time: string } | null; games: PlayoffGame[]; busy: Array<Busy & { date: string }> }) {
  const slots: PlayoffSlot[] = []; const unplaced: string[] = [];
  const busy = [...o.busy];
  const days = [...o.days].sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from));
  let cursor = o.after ? { date: o.after.date, min: toMin(o.after.time) } : null;
  const rounds = [...new Set(o.games.map((g) => g.round))].sort((a, b) => a - b);
  for (const r of rounds) {
    const todo = o.games.filter((g) => g.round === r).sort((a, b) => a.order - b.order);
    let roundEnd: { date: string; min: number } | null = null;
    for (const g of todo) {
      let placed: PlayoffSlot | null = null;
      for (const d of days) {
        if (cursor && d.date < cursor.date) continue;
        let start = toMin(d.from);
        if (cursor && d.date === cursor.date) start = Math.max(start, cursor.min);
        for (let t = start; t + o.minutes <= toMin(d.to) && !placed; t += 5) {
          for (const c of d.courtIds) {
            const clash = busy.some((b) => b.date === d.date && Number(b.courtId) === c && toMin(b.start) < t + o.minutes && toMin(b.end) > t);
            if (!clash) { placed = { id: g.id, date: d.date, time: toHHMM(t), courtId: c }; break; }
          }
        }
        if (placed) break;
      }
      if (!placed) { unplaced.push(g.id); continue; }
      slots.push(placed);
      busy.push({ date: placed.date, courtId: placed.courtId, start: placed.time, end: toHHMM(toMin(placed.time) + o.minutes) });
      const end = { date: placed.date, min: toMin(placed.time) + o.minutes };
      if (!roundEnd || end.date > roundEnd.date || (end.date === roundEnd.date && end.min > roundEnd.min)) roundEnd = end;
    }
    if (roundEnd) cursor = roundEnd;
  }
  return { slots, unplaced };
}

const DONE = ["completed", "forfeited", "walkover", "cancelled", "in_progress", "live", "confirmed"];

/** Book every open knockout game of a timed tournament right after the stage before it. */
export async function scheduleWeekendPlayoffs(champId: string): Promise<{ booked: number; unplaced: number; issues: string[] }> {
  const out = { booked: 0, unplaced: 0, issues: [] as string[] };
  const ctx = await loadTimedContext(champId);
  if (!ctx || !ctx.days.length) return out; // weekly / play-by tournaments: play-off days are set by the organiser
  const { data } = await fromExt("club_champs_matches").select("id, stage, stage_key, round_number, bracket_position, pool_number, status, winner_member_id, booking_id, court_id, scheduled_date, scheduled_time, player_a_member_id, player_b_member_id").eq("champ_id", champId);
  const rows = (data ?? []) as any[];
  const isKo = (m: any) => m.stage === "ko";
  const open = rows.filter((m) => isKo(m) && !m.booking_id && !m.winner_member_id && m.player_a_member_id && m.player_b_member_id && !DONE.includes(String(m.status ?? "").toLowerCase()));
  if (!open.length) return out;
  const openIds = new Set(open.map((m) => m.id));
  const timed = rows.filter((m) => !openIds.has(m.id) && m.scheduled_date && m.scheduled_time);
  // Start after the last game of everything already placed that comes before these games.
  const minRound = Math.min(...open.map((m) => Number(m.round_number) || 1));
  const before = timed.filter((m) => !isKo(m) || (Number(m.round_number) || 1) < minRound);
  let after: { date: string; time: string } | null = null;
  for (const m of before) {
    const d = String(m.scheduled_date).slice(0, 10), end = toMin(m.scheduled_time) + ctx.minutes;
    if (!after || d > after.date || (d === after.date && end > toMin(after.time))) after = { date: d, time: toHHMM(end) };
  }
  const busy = [...ctx.busyOther, ...timed.filter((m) => m.court_id).map((m) => ({ date: String(m.scheduled_date).slice(0, 10), courtId: Number(m.court_id), start: String(m.scheduled_time).slice(0, 5), end: toHHMM(toMin(m.scheduled_time) + ctx.minutes) }))];
  const plan = planPlayoffsAfter({ days: ctx.days, minutes: ctx.minutes, after, busy,
    games: open.map((m) => ({ id: m.id, round: Number(m.round_number) || 1, order: (Number(m.pool_number) || 1) * 1000 + (Number(m.bracket_position) || 0) })) });
  for (const s of plan.slots) {
    const { error } = await rpcExt("self_schedule_champ_match", { p_match_id: s.id, p_court_id: s.courtId, p_date: s.date, p_time: `${s.time}:00`, p_duration_minutes: ctx.minutes });
    if (error) out.issues.push(error.message); else out.booked++;
  }
  out.unplaced = plan.unplaced.length;
  if (plan.unplaced.length) out.issues.push(`${plan.unplaced.length} play-off game(s) don't fit in the tournament's remaining playing times after ${after ? `${after.date} ${after.time}` : "the previous stage"}.`);
  return out;
}
