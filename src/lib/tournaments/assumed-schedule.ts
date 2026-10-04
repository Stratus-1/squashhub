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
import { bellsSlotMinutes, planDays, type TimedDay } from "./formal-stage-schedule";
import { provisionalPlayoffs } from "./provisional-playoffs";

/** pace: "fast" = start early and finish as soon as possible; "spread" = spread qualifying rounds over the period.
 *  playoffStart: "after" = gap minutes after the unit's last qualifying game; "fixed" = not before date + time. */
export type PlayoffStart = { mode?: "after" | "fixed"; gap?: string | number; date?: string; time?: string };
export type SchedAssume = { singles?: string | number; doubles?: string | number; rest?: string | number; pace?: "fast" | "spread"; playoffStart?: PlayoffStart };
/** key = category or "Cat::Sub" ("" = every category); optional round / pool narrow it further. */
export type CourtRule = { key: string; courtIds: Array<string | number>; round?: number | string | null; pool?: number | string | null };

/** `bellsMinutes` set = Time-capped/Bells game: its own configured slot (play + changeover) is authoritative. */
/** phase 0 = qualifying/pool/main rounds; higher phases = play-off stages (QF < SF < Final). `provisional` = no fixture
 *  row yet: a TBD play-off slot that is reserved on the court diary only. */
export type AssumeGame = { id: string; round: number; pool: number | null; unitKey: string; doubles: boolean; people: string[]; bellsMinutes?: number | null; phase?: number; label?: string; provisional?: boolean };

/** Scoring that applies to a unit key (subcategory override → category override → tournament default). */
export function scoringForKey(plan: any, key: string) {
  const o = plan?.scoringOverrides ?? {};
  return o[key] ?? o[key.split("::")[0]] ?? plan?.scoring ?? null;
}
/** Bells slot minutes for this unit, or null when it plays Standard format. */
export function bellsMinutesFor(plan: any, key: string): number | null {
  return bellsSlotMinutes(scoringForKey(plan, key));
}
export type Interval = { date: string; courtId: number; start: number; end: number; people?: string[] };
export type AssumeSlot = { id: string; date: string; time: string; end: string; courtId: number; provisional?: boolean; label?: string; unitKey?: string };
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
export function missingAssumptions(plan: any, games: Array<Pick<AssumeGame, "doubles" | "bellsMinutes"> & { phase?: number }>): string[] {
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
  // Bells/time-capped games use their own configured slot — never a Courts & Dates estimate.
  const std = games.filter((g) => !(Number(g.bellsMinutes) > 0));
  if (std.some((g) => !g.doubles) && !(num(s.singles) > 0)) out.push("Scheduling assumptions: estimated court time per Singles match (minutes).");
  if (std.some((g) => g.doubles) && !(num(s.doubles) > 0)) out.push("Scheduling assumptions: estimated court time per Doubles match (minutes).");
  const ps = s.playoffStart ?? {};
  if ((games as any[]).some((g) => (g.phase ?? 0) > 0) && ps.mode === "fixed") {
    if (!ps.date || !ps.time) out.push("Playoff start: choose the day and time playoffs start.");
    else if (!days.some((d) => String(d?.date ?? "").slice(0, 10) === ps.date)) out.push("Playoff start: the chosen day is not one of the tournament dates.");
  }
  if (!(num(s.rest) >= 0)) out.push("Scheduling assumptions: minimum rest between matches for the same player/pair (minutes, 0 allowed).");
  return out;
}

export function planAssumedSchedule(o: {
  games: AssumeGame[]; days: TimedDay[]; singles: number; doubles: number; rest: number;
  rules?: CourtRule[]; busy?: Interval[]; step?: number; pace?: "fast" | "spread"; playoffStart?: PlayoffStart;
}): AssumePlan {
  const step = o.step ?? (o.games.some((g) => Number(g.bellsMinutes) > 0) ? 1 : 5); // Bells waves run back-to-back on their exact slot
  const days = [...o.days].filter((d) => d.courtIds.length && toMin(d.to) > toMin(d.from))
    .sort((a, b) => a.date.localeCompare(b.date) || toMin(a.from) - toMin(b.from));
  // One timeline across the whole weekend so capacity, dependencies and pacing are judged together.
  const dateIdx = new Map(Array.from(new Set(days.map((d) => d.date))).map((d, i) => [d, i]));
  const abs = (date: string, t: number) => (dateIdx.get(date) ?? 0) * 1440 + t;
  const periodStart = days.length ? abs(days[0].date, toMin(days[0].from)) : 0;
  const periodEnd = days.length ? Math.max(...days.map((d) => abs(d.date, toMin(d.to)))) : 0;
  const durOf = (g: AssumeGame) => (Number(g.bellsMinutes) > 0 ? Number(g.bellsMinutes) : g.doubles ? o.doubles : o.singles);
  const ph = (g: AssumeGame) => g.phase ?? 0;
  const ps = o.playoffStart ?? {};
  const gap = ps.gap == null || ps.gap === "" ? 30 : Math.max(0, Number(ps.gap) || 0); // UI default: 30 min after qualifying
  const fixedAbs = ps.mode === "fixed" && ps.date && ps.time && dateIdx.has(ps.date) ? abs(ps.date, toMin(ps.time)) : null;
  const firstPO = new Map<string, number>();
  for (const g of o.games) if (ph(g) > 0) firstPO.set(g.unitKey, Math.min(firstPO.get(g.unitKey) ?? Infinity, ph(g)));

  // Spread pacing: qualifying rounds are spaced over the time left before the play-off window.
  const courtsTotal = Math.max(1, Math.max(0, ...days.map((d) => d.courtIds.length)));
  const poLen = (() => {
    let worst = 0;
    for (const u of firstPO.keys()) {
      const byPh = new Map<number, AssumeGame[]>();
      for (const g of o.games) if (g.unitKey === u && ph(g) > 0) byPh.set(ph(g), [...(byPh.get(ph(g)) ?? []), g]);
      let len = gap;
      for (const gs of byPh.values()) len += Math.ceil(gs.length / courtsTotal) * Math.max(...gs.map(durOf)) + o.rest;
      worst = Math.max(worst, len);
    }
    return worst;
  })();
  const qualEnd = fixedAbs ?? periodEnd - poLen;
  const maxRound = Math.max(1, ...o.games.filter((g) => ph(g) === 0).map((g) => g.round));

  const taken: Interval[] = [...(o.busy ?? [])];
  const games = o.games.map((g, i) => ({ g, i })).sort((a, b) => ph(a.g) - ph(b.g) || a.g.round - b.g.round || a.i - b.i).map((x) => x.g);
  const slots: AssumeSlot[] = [];
  const relaxed: string[] = [];
  const unplaced: Array<{ g: AssumeGame; why: string }> = [];
  const endAbs = new Map<string, number>();

  const fits = (g: AssumeGame, allowed: number[] | null, dur: number, rest: number, nb: number, dl: number) => {
    for (const d of days) {
      const courts = allowed ? d.courtIds.filter((c) => allowed.includes(c)) : d.courtIds;
      if (!courts.length) continue;
      for (let t = toMin(d.from); t + dur <= toMin(d.to); t += step) {
        const a = abs(d.date, t);
        if (a < nb) continue;
        if (a + dur > dl) break;
        const peopleOk = !taken.some((b) => b.date === d.date && b.people?.some((p) => g.people.includes(p)) && t < b.end + rest && t + dur + rest > b.start);
        if (!peopleOk) continue;
        const c = courts.find((c) => !taken.some((b) => b.date === d.date && b.courtId === c && t < b.end && t + dur > b.start));
        if (c != null) return { date: d.date, t, c };
      }
    }
    return null;
  };

  for (const g of games) {
    const dur = durOf(g);
    const allowed = allowedCourts(g, o.rules ?? []);
    if (allowed && !days.some((d) => d.courtIds.some((c) => allowed.includes(c)))) { unplaced.push({ g, why: "its court restriction allows no court that is available on the tournament dates" }); continue; }
    let nb = periodStart, dl = Infinity;
    if (ph(g) === 0) {
      if (o.pace === "spread" && qualEnd > periodStart) nb = periodStart + Math.floor(((g.round - 1) / maxRound) * (qualEnd - periodStart));
      if (fixedAbs != null && firstPO.has(g.unitKey)) dl = fixedAbs;
    } else {
      // A play-off game can't start before every earlier game of its unit can have finished.
      const feeders = o.games.filter((x) => x.unitKey === g.unitKey && ph(x) < ph(g));
      if (feeders.some((x) => !endAbs.has(x.id))) { unplaced.push({ g, why: "its earlier games could not be placed" }); continue; }
      const dep = Math.max(periodStart, ...feeders.map((x) => endAbs.get(x.id)!));
      const isFirst = firstPO.get(g.unitKey) === ph(g);
      nb = dep + (isFirst ? (ps.mode === "fixed" ? o.rest : gap) : o.rest);
      if (isFirst && fixedAbs != null) nb = Math.max(nb, fixedAbs);
    }
    let hit = fits(g, allowed, dur, o.rest, nb, dl);
    if (!hit && o.rest > 0) { hit = fits(g, allowed, dur, 0, nb, dl); if (hit) relaxed.push(g.id); }
    if (!hit) {
      const why = ph(g) > 0 ? "no court time left after its qualifiers/feeder games finish" : dl !== Infinity ? "no court time left before the playoff start time" : allowed ? "no free time on its restricted courts" : "no free court time left";
      unplaced.push({ g, why }); continue;
    }
    taken.push({ date: hit.date, courtId: hit.c, start: hit.t, end: hit.t + dur, people: g.people });
    endAbs.set(g.id, abs(hit.date, hit.t + dur));
    slots.push({ id: g.id, date: hit.date, time: toHHMM(hit.t), end: toHHMM(hit.t + dur), courtId: hit.c, provisional: g.provisional, label: g.label, unitKey: g.unitKey });
  }

  const issues: string[] = [];
  if (unplaced.length) {
    const byWhy = new Map<string, AssumeGame[]>();
    for (const u of unplaced) { const k = `${u.g.unitKey.replace(/::/g, " › ") || "Games"}${ph(u.g) > 0 ? " play-offs" : ""} — ${u.why}`; byWhy.set(k, [...(byWhy.get(k) ?? []), u.g]); }
    const po = unplaced.filter((u) => ph(u.g) > 0).length;
    issues.push(`Not enough court capacity: ${unplaced.length} of ${games.length} games${po ? ` (incl. ${po} play-off game${po === 1 ? "" : "s"})` : ""} could not be placed. Nothing was changed.`);
    for (const [k, gs] of byWhy) issues.push(`${gs.length} game${gs.length === 1 ? "" : "s"}: ${k}.`);
    issues.push("Add courts or time, shorten the estimated Standard match times, reduce the rest time, move the playoff start, or loosen a court restriction in Courts & Dates.");
  }
  return { slots: issues.length ? [] : slots, issues, relaxed: issues.length ? [] : relaxed };
}

/* ------------------------------------------------------------------ */

const TERMINAL = ["completed", "forfeited", "walkover", "in_progress", "live"];
const PO_RANK: Record<string, number> = { playoff_qf: 1, playoff_sf: 2, playoff_final: 3, playoff_3rd: 3 };
export const provisionalPrefix = (champId: string) => `sbs:${champId}:po:`;

export type AssumeLoad = {
  plan: any; missing: string[]; games: AssumeGame[]; days: TimedDay[]; busy: Interval[];
  singles: number; doubles: number; rest: number; rules: CourtRule[]; clubId: string | null; name: string;
};

/** Is this a Step-by-Step tournament whose Courts & Dates carries scheduling assumptions? */
export async function hasAssumptions(champId: string): Promise<boolean> {
  const { data } = await fromExt("tournaments").select("beta_lifecycle").eq("id", champId).maybeSingle();
  return !!(data as any)?.beta_lifecycle?.format_plan?.scheduling;
}

export async function loadAssumed(champId: string): Promise<AssumeLoad> {
  const [{ data: t }, { data: rows }] = await Promise.all([
    fromExt("tournaments").select("club_id, name, beta_lifecycle, group_labels").eq("id", champId).maybeSingle(),
    fromExt("club_champs_matches").select("id, round_number, group_number, pool_number, status, winner_member_id, booking_id, court_id, scheduled_date, scheduled_time, is_bye, stage, stage_label, placeholder_a, placeholder_b, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id").eq("champ_id", champId),
  ]);
  const plan: any = (t as any)?.beta_lifecycle?.format_plan ?? {};
  const labels: Record<string, string> = ((t as any)?.group_labels ?? {}) as any;
  const s = plan.scheduling ?? {};
  const singles = Number(s.singles) || 0, doubles = Number(s.doubles) || 0, rest = Math.max(0, Number(s.rest) || 0);
  const stageOf = (m: any) => String(m.stage ?? "");
  const isPO = (m: any) => stageOf(m).startsWith("playoff");
  // Fixtures whose players are still TBD (later knockout rounds, play-off rows) are scheduled too — they hold a slot.
  const all = ((rows ?? []) as any[]).filter((m) => !m.is_bye && ((m.player_a_member_id && m.player_b_member_id) || isPO(m) || stageOf(m) === "ko"));
  const people = (m: any) => [m.player_a_member_id, m.partner_a_member_id, m.player_b_member_id, m.partner_b_member_id].filter(Boolean);
  const isDbl = (m: any) => !!(m.partner_a_member_id || m.partner_b_member_id);
  const movable = (m: any) => !m.winner_member_id && !m.booking_id && !TERMINAL.includes(String(m.status ?? "").toLowerCase());
  const keyOf = (m: any) => unitKeyOf(String(labels[String(m.group_number)] ?? ""));
  const unitDbl = new Map<string, boolean>();
  for (const m of all) if (isDbl(m)) unitDbl.set(keyOf(m), true);
  const dblOf = (m: any) => isDbl(m) || !!unitDbl.get(keyOf(m));
  const durOf = (m: any) => bellsMinutesFor(plan, keyOf(m)) ?? (dblOf(m) ? doubles : singles || 30);
  const koMin = new Map<string, number>();
  for (const m of all) if (stageOf(m) === "ko") koMin.set(keyOf(m), Math.min(koMin.get(keyOf(m)) ?? Infinity, Number(m.round_number) || 1));
  const phaseOf = (m: any) => (isPO(m) ? 10 + (PO_RANK[stageOf(m)] ?? 1) : stageOf(m) === "ko" ? (Number(m.round_number) || 1) - (koMin.get(keyOf(m)) ?? 1) : 0);
  const games: AssumeGame[] = all.filter(movable).map((m) => ({
    id: m.id, round: Number(m.round_number) || 1, pool: m.pool_number != null ? Number(m.pool_number) : null,
    unitKey: keyOf(m), doubles: dblOf(m), people: people(m), bellsMinutes: bellsMinutesFor(plan, keyOf(m)), phase: phaseOf(m),
    label: m.stage_label ?? undefined,
  }));
  // Planned play-offs that have no fixture rows yet: reserve TBD slots so the whole weekend is planned at once.
  const hasPO = new Set(all.filter((m) => isPO(m) || stageOf(m) === "ko").map(keyOf));
  const units = new Map<string, Set<number>>();
  for (const m of all) if (!isPO(m) && stageOf(m) !== "ko") { const k = keyOf(m); if (!units.has(k)) units.set(k, new Set()); if (m.pool_number != null) units.get(k)!.add(Number(m.pool_number)); }
  for (const [k, pools] of units) {
    if (hasPO.has(k)) continue;
    for (const p of provisionalPlayoffs(plan, k, Math.max(1, pools.size))) {
      games.push({ id: p.key, round: p.phase, pool: null, unitKey: k, doubles: !!unitDbl.get(k), people: [], bellsMinutes: bellsMinutesFor(plan, k), phase: 10 + p.phase, label: p.label, provisional: true });
    }
  }
  const days = planDays(plan);
  // Played/started/booked games of this tournament keep their slot and block court + players.
  const busy: Interval[] = all.filter((m) => !movable(m) && m.scheduled_date && m.scheduled_time && m.court_id).map((m) => {
    const st = toMin(m.scheduled_time);
    return { date: String(m.scheduled_date).slice(0, 10), courtId: Number(m.court_id), start: st, end: st + durOf(m), people: people(m) };
  });
  const dates = Array.from(new Set(days.map((d) => d.date)));
  const courts = Array.from(new Set(days.flatMap((d) => d.courtIds)));
  if (dates.length && courts.length) {
    const [{ data: other }, { data: bk }] = await Promise.all([
      fromExt("club_champs_matches").select("champ_id, court_id, scheduled_date, scheduled_time").in("scheduled_date", dates).in("court_id", courts).neq("champ_id", champId),
      fromExt("bookings").select("court_id, date, start_time, end_time, external_id").in("date", dates).eq("status", "active").in("court_id", courts),
    ]);
    for (const m of (other ?? []) as any[]) if (m.scheduled_time) { const st = toMin(m.scheduled_time); busy.push({ date: String(m.scheduled_date).slice(0, 10), courtId: Number(m.court_id), start: st, end: st + 45 }); }
    // Session reservations (`sbs:`) are the courts being scheduled into, never a clash — except another
    // tournament's provisional play-off slots, which are real holds.
    for (const b of (bk ?? []) as any[]) {
      const ext = String(b.external_id ?? "");
      const own = ext.startsWith("sbs:") && !(ext.includes(":po:") && !ext.startsWith(provisionalPrefix(champId)));
      if (!own) busy.push({ date: String(b.date).slice(0, 10), courtId: Number(b.court_id), start: toMin(b.start_time), end: toMin(b.end_time) });
    }
  }
  return { plan, missing: missingAssumptions(plan, games), games, days, busy, singles, doubles, rest, rules: (plan.courtRules ?? []) as CourtRule[], clubId: (t as any)?.club_id ?? null, name: (t as any)?.name ?? "Tournament" };
}

/** Plan (dryRun) or plan + write the draft timetable. Writes nothing when anything is missing or conflicts. */
export async function scheduleWithAssumptions(champId: string, opts: { dryRun?: boolean } = {}) {
  const L = await loadAssumed(champId);
  const provisionalCount = L.games.filter((g) => g.provisional).length;
  const base = { relaxed: [] as string[], scheduled: 0, total: L.games.length, provisional: provisionalCount, slots: [] as AssumeSlot[] };
  if (L.missing.length) return { ...base, missing: L.missing, issues: [] as string[] };
  const s = L.plan.scheduling ?? {};
  const res = planAssumedSchedule({ games: L.games, days: L.days, singles: L.singles, doubles: L.doubles, rest: L.rest, rules: L.rules, busy: L.busy, pace: s.pace, playoffStart: s.playoffStart });
  if (!opts.dryRun && !res.issues.length) {
    for (const sl of res.slots.filter((x) => !x.provisional)) {
      const { error } = await fromExt("club_champs_matches")
        .update({ scheduled_date: sl.date, scheduled_time: `${sl.time}:00`, court_id: sl.courtId, play_by: null } as any)
        .eq("id", sl.id).is("winner_member_id", null).is("booking_id", null);
      if (error) throw new Error(error.message);
    }
    if (L.clubId) {
      // Provisional play-off slots: stable, idempotent court holds; stale ones from an earlier run are released.
      const keep = res.slots.filter((x) => x.provisional).map((x) => `${provisionalPrefix(champId)}${x.id}`);
      const { data: old } = await fromExt("bookings").select("id, external_id").eq("club_id", L.clubId).eq("source", "club_event").like("external_id", `${provisionalPrefix(champId)}%`);
      const stale = ((old ?? []) as any[]).filter((b) => !keep.includes(b.external_id)).map((b) => b.id);
      if (stale.length) { const { error } = await fromExt("bookings").delete().in("id", stale); if (error) throw new Error(error.message); }
      for (const sl of res.slots.filter((x) => x.provisional)) {
        const { error } = await fromExt("bookings").upsert({
          club_id: L.clubId, court_id: sl.courtId, user_id: null, club_member_id: null, date: sl.date, start_time: `${sl.time}:00`, end_time: `${sl.end}:00`,
          status: "active", is_friendly: false, guest_name: `${L.name} — ${sl.unitKey ? sl.unitKey.replace(/::/g, " › ") + " · " : ""}${sl.label ?? "Play-off (TBD)"}`,
          source: "club_event", external_id: `${provisionalPrefix(champId)}${sl.id}`, ops_note: "Provisional play-off slot (players TBD)",
        } as any, { onConflict: "club_id,source,external_id" });
        if (error) throw new Error(error.message);
      }
    }
  }
  return { ...base, missing: [] as string[], issues: res.issues, relaxed: res.relaxed, scheduled: res.slots.length, slots: res.slots };
}
