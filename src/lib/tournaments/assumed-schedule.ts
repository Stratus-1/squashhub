/**
 * Weekend "Assign courts & times" from the Courts & Dates setup (format_plan.days + format_plan.scheduling
 * + format_plan.courtRules). Pure planner + loader/writer. Slot minutes are scheduling estimates only —
 * they never change scoring or Bells/time-capped rules.
 *
 * Hard: court windows/selected courts · court restrictions · no court double-booking · no person in two
 * games at once. Soft: minimum rest (relaxed per game only when nothing else fits, and reported).
 * All-or-nothing: if any game cannot be placed nothing is written and the conflicts are returned.
 */
import { fromExt } from "@/lib/supabase-ext";
import { unitKeyOf } from "@/lib/smart-builder/step-draw";
import { planDays, type TimedDay } from "./formal-stage-schedule";

export type SchedAssume = { singles?: string | number; doubles?: string | number; rest?: string | number };
/** key = category or "Cat::Sub" ("" = every category); optional round / pool narrow it further. */
export type CourtRule = { key: string; courtIds: Array<string | number>; round?: number | string | null; pool?: number | string | null };

export type AssumeGame = { id: string; round: number; pool: number | null; unitKey: string; doubles: boolean; people: string[] };
export type Interval = { date: string; courtId: number; start: number; end: number; people?: string[] };
export type AssumeSlot = { id: string; date: string; time: string; courtId: number };
export type AssumePlan = { slots: AssumeSlot[]; issues: string[]; relaxed: string[] };

const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(":").map(Number); return h * 60 + (m || 0); };
export const toHHMM = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const num = (v: unknown) => (v === "" || v == null ? NaN : Number(v));

/** Courts a game may use: intersection of every matching rule; null = any selected court. */
export function allowedCourts(g: Pick<AssumeGame, "unitKey" | "round" | "pool">, rules: CourtRule[]): number[] | null {
  const hits = rules.filter((r) => {
    if (!(r.courtIds ?? []).length) return false;
    if (r.key && !(g.unitKey === r.key || g.unitKey.startsWith(`${r.key}::`))) return false;
    if (Number.isFinite(num(r.round)) && Number(r.round) !== g.round) return false;
    if (Number.isFinite(num(r.pool)) && Number(r.pool) !== g.pool) return false;
    return true;
  });
  if (!hits.length) return null;
  return hits.map((r) => r.courtIds.map(Number)).reduce((a, b) => a.filter((c) => b.includes(c)));
}

/** What is still missing before automatic scheduling can run (empty = ready). */
export function missingAssumptions(plan: any, games: Array<Pick<AssumeGame, "doubles">>): string[] {
  const out: string[] = [];
  const days: any[] = plan?.days ?? [];
  if (!days.length) out.push("No tournament dates are set (Dates step).");
  for (const d of days) {
    const label = d?.date ? String(d.date).slice(0, 10) : "a day without a date";
    if (!d?.date) out.push("One day has no date.");
    if (!(d?.courtIds ?? []).length) out.push(`${label}: tick which club courts are available.`);
    if (!(d?.windows ?? []).some((w: any) => w?.from && w?.to && w.from < w.to)) out.push(`${label}: add a start and end time for when courts are free.`);
  }
  const s = plan?.scheduling ?? {};
  if (games.some((g) => !g.doubles) && !(num(s.singles) > 0)) out.push("Scheduling assumptions: estimated court time per Singles match (minutes).");
  if (games.some((g) => g.doubles) && !(num(s.doubles) > 0)) out.push("Scheduling assumptions: estimated court time per Doubles match (minutes).");
  if (!(num(s.rest) >= 0)) out.push("Scheduling assumptions: minimum rest between matches for the same player/pair (minutes, 0 allowed).");
  return out;
}

export function planAssumedSchedule(o: {
  games: AssumeGame[]; days: TimedDay[]; singles: number; doubles: number; rest: number;
  rules?: CourtRule[]; busy?: Interval[]; step?: number;
}): AssumePlan {
  const step = o.step ?? 5;
  const days = [...o.days].filter((d) => d.courtIds.length && toMin(d.to) > toMin(d.from))
    .sort((a, b) => a.date.localeCompare(b.date) || toMin(a.from) - toMin(b.from));
  const taken: Interval[] = [...(o.busy ?? [])];
  const games = o.games.map((g, i) => ({ g, i })).sort((a, b) => a.g.round - b.g.round || a.i - b.i).map((x) => x.g);
  const slots: AssumeSlot[] = [];
  const relaxed: string[] = [];
  const unplaced: Array<{ g: AssumeGame; why: string }> = [];

  const fits = (g: AssumeGame, allowed: number[] | null, dur: number, rest: number) => {
    for (const d of days) {
      const courts = allowed ? d.courtIds.filter((c) => allowed.includes(c)) : d.courtIds;
      if (!courts.length) continue;
      for (let t = toMin(d.from); t + dur <= toMin(d.to); t += step) {
        const peopleOk = !taken.some((b) => b.date === d.date && b.people?.some((p) => g.people.includes(p)) && t < b.end + rest && t + dur + rest > b.start);
        if (!peopleOk) continue;
        const c = courts.find((c) => !taken.some((b) => b.date === d.date && b.courtId === c && t < b.end && t + dur > b.start));
        if (c != null) return { date: d.date, t, c };
      }
    }
    return null;
  };

  for (const g of games) {
    const dur = g.doubles ? o.doubles : o.singles;
    const allowed = allowedCourts(g, o.rules ?? []);
    if (allowed && !days.some((d) => d.courtIds.some((c) => allowed.includes(c)))) { unplaced.push({ g, why: "its court restriction allows no court that is available on the tournament dates" }); continue; }
    let hit = fits(g, allowed, dur, o.rest);
    if (!hit && o.rest > 0) { hit = fits(g, allowed, dur, 0); if (hit) relaxed.push(g.id); }
    if (!hit) { unplaced.push({ g, why: allowed ? "no free time on its restricted courts" : "no free court time left" }); continue; }
    taken.push({ date: hit.date, courtId: hit.c, start: hit.t, end: hit.t + dur, people: g.people });
    slots.push({ id: g.id, date: hit.date, time: toHHMM(hit.t), courtId: hit.c });
  }

  const issues: string[] = [];
  if (unplaced.length) {
    const byWhy = new Map<string, AssumeGame[]>();
    for (const u of unplaced) byWhy.set(`${u.g.unitKey.replace(/::/g, " › ") || "Games"} — ${u.why}`, [...(byWhy.get(`${u.g.unitKey.replace(/::/g, " › ") || "Games"} — ${u.why}`) ?? []), u.g]);
    issues.push(`${unplaced.length} of ${games.length} games could not be placed. Nothing was changed.`);
    for (const [k, gs] of byWhy) issues.push(`${gs.length} game${gs.length === 1 ? "" : "s"}: ${k}.`);
    issues.push("Add courts or time, shorten the estimated match times, reduce the rest time, or loosen a court restriction in Courts & Dates.");
  }
  return { slots: issues.length ? [] : slots, issues, relaxed: issues.length ? [] : relaxed };
}

/* ------------------------------------------------------------------ */

const TERMINAL = ["completed", "forfeited", "walkover", "in_progress", "live"];

export type AssumeLoad = {
  plan: any; missing: string[]; games: AssumeGame[]; days: TimedDay[]; busy: Interval[];
  singles: number; doubles: number; rest: number; rules: CourtRule[];
};

/** Is this a Step-by-Step tournament whose Courts & Dates carries scheduling assumptions? */
export async function hasAssumptions(champId: string): Promise<boolean> {
  const { data } = await fromExt("tournaments").select("beta_lifecycle").eq("id", champId).maybeSingle();
  return !!(data as any)?.beta_lifecycle?.format_plan?.scheduling;
}

export async function loadAssumed(champId: string): Promise<AssumeLoad> {
  const [{ data: t }, { data: rows }] = await Promise.all([
    fromExt("tournaments").select("beta_lifecycle, group_labels").eq("id", champId).maybeSingle(),
    fromExt("club_champs_matches").select("id, round_number, group_number, pool_number, status, winner_member_id, booking_id, court_id, scheduled_date, scheduled_time, is_bye, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id").eq("champ_id", champId),
  ]);
  const plan: any = (t as any)?.beta_lifecycle?.format_plan ?? {};
  const labels: Record<string, string> = ((t as any)?.group_labels ?? {}) as any;
  const s = plan.scheduling ?? {};
  const singles = Number(s.singles) || 0, doubles = Number(s.doubles) || 0, rest = Math.max(0, Number(s.rest) || 0);
  const all = ((rows ?? []) as any[]).filter((m) => !m.is_bye && m.player_a_member_id && m.player_b_member_id);
  const people = (m: any) => [m.player_a_member_id, m.partner_a_member_id, m.player_b_member_id, m.partner_b_member_id].filter(Boolean);
  const isDbl = (m: any) => !!(m.partner_a_member_id || m.partner_b_member_id);
  const movable = (m: any) => !m.winner_member_id && !m.booking_id && !TERMINAL.includes(String(m.status ?? "").toLowerCase());
  const games: AssumeGame[] = all.filter(movable).map((m) => ({
    id: m.id, round: Number(m.round_number) || 1, pool: m.pool_number != null ? Number(m.pool_number) : null,
    unitKey: unitKeyOf(String(labels[String(m.group_number)] ?? "")), doubles: isDbl(m), people: people(m),
  }));
  const days = planDays(plan);
  // Played/started/booked games of this tournament keep their slot and block court + players.
  const busy: Interval[] = all.filter((m) => !movable(m) && m.scheduled_date && m.scheduled_time && m.court_id).map((m) => {
    const st = toMin(m.scheduled_time);
    return { date: String(m.scheduled_date).slice(0, 10), courtId: Number(m.court_id), start: st, end: st + (isDbl(m) ? doubles : singles || 30), people: people(m) };
  });
  const dates = Array.from(new Set(days.map((d) => d.date)));
  const courts = Array.from(new Set(days.flatMap((d) => d.courtIds)));
  if (dates.length && courts.length) {
    const [{ data: other }, { data: bk }] = await Promise.all([
      fromExt("club_champs_matches").select("champ_id, court_id, scheduled_date, scheduled_time").in("scheduled_date", dates).in("court_id", courts).neq("champ_id", champId),
      fromExt("bookings").select("court_id, date, start_time, end_time, external_id").in("date", dates).eq("status", "active").in("court_id", courts),
    ]);
    for (const m of (other ?? []) as any[]) if (m.scheduled_time) { const st = toMin(m.scheduled_time); busy.push({ date: String(m.scheduled_date).slice(0, 10), courtId: Number(m.court_id), start: st, end: st + 45 }); }
    // The tournament's own `sbs:` session reservations are the courts it is scheduling into, never a clash.
    for (const b of (bk ?? []) as any[]) if (!String(b.external_id ?? "").startsWith("sbs:")) busy.push({ date: String(b.date).slice(0, 10), courtId: Number(b.court_id), start: toMin(b.start_time), end: toMin(b.end_time) });
  }
  return { plan, missing: missingAssumptions(plan, games), games, days, busy, singles, doubles, rest, rules: (plan.courtRules ?? []) as CourtRule[] };
}

/** Plan (dryRun) or plan + write the draft timetable. Writes nothing when anything is missing or conflicts. */
export async function scheduleWithAssumptions(champId: string, opts: { dryRun?: boolean } = {}) {
  const L = await loadAssumed(champId);
  if (L.missing.length) return { missing: L.missing, issues: [] as string[], relaxed: [] as string[], scheduled: 0, total: L.games.length };
  const res = planAssumedSchedule({ games: L.games, days: L.days, singles: L.singles, doubles: L.doubles, rest: L.rest, rules: L.rules, busy: L.busy });
  if (!opts.dryRun) {
    for (const s of res.slots) {
      const { error } = await fromExt("club_champs_matches")
        .update({ scheduled_date: s.date, scheduled_time: `${s.time}:00`, court_id: s.courtId, play_by: null } as any)
        .eq("id", s.id).is("winner_member_id", null).is("booking_id", null);
      if (error) throw new Error(error.message);
    }
  }
  return { missing: [] as string[], issues: res.issues, relaxed: res.relaxed, scheduled: res.slots.length, total: L.games.length };
}
