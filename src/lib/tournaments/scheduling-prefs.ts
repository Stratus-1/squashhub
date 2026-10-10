/**
 * Scheduling preferences for centrally allocated (fixed date/window/courts) Step-by-Step games.
 * Pure: the Generate Draw & Fixtures preview and the real allocation both call `planPrefWaves`.
 *
 * Hard (never broken): stage/date courts · no court collision · no person on two courts at once ·
 * category "Only these courts" · required rest. Soft (best effort, never at the cost of a hard rule):
 * avoid back-to-back · preferred category courts · rotate courts.
 * A "slot" is the tournament's own slot (e.g. Bells 10 + 3 = 13 min), never a hard-coded duration.
 */

export type RestPref = "none" | "avoid" | "one" | "two";
export type CourtPref = "any" | "rotate" | "category";
/**
 * Per category (or subcategory override) court + evening preference. `weekdays` are JS day numbers
 * (0 = Sun … 6 = Sat), applied to every round's planned dates. `rule` covers both courts and evenings.
 * Key = unit key ("Mens" or "Mens::A"); a subcategory rule replaces its category's rule entirely.
 */
export type CategoryCourtRule = { key: string; courtIds: number[]; rule: "preferred" | "only"; weekdays?: number[] };
/** `courtsPreBooked`: organiser confirms the club already booked the courts for this tournament,
 *  so existing bookings inside the planned session windows are treated as the tournament's own room. */
export type SchedulingPrefs = { rest: RestPref; courts: CourtPref; categoryCourts: CategoryCourtRule[]; courtsPreBooked?: boolean };

export const DEFAULT_SCHEDULING_PREFS: SchedulingPrefs = { rest: "none", courts: "any", categoryCourts: [] };

export const REST_LABEL: Record<RestPref, string> = {
  none: "No restriction",
  avoid: "Avoid back-to-back where possible",
  one: "Require 1 time-slot rest",
  two: "Require 2 time-slots rest",
};
export const COURT_LABEL: Record<CourtPref, string> = {
  any: "Any available court",
  rotate: "Rotate courts where possible",
  category: "Assign courts & evenings by category/group",
};

/** Saved value → safe prefs. Missing/junk = defaults (existing behaviour). */
export function normaliseSchedulingPrefs(raw: any): SchedulingPrefs {
  const rest: RestPref = ["none", "avoid", "one", "two"].includes(raw?.rest) ? raw.rest : "none";
  const courts: CourtPref = ["any", "rotate", "category"].includes(raw?.courts) ? raw.courts : "any";
  const categoryCourts: CategoryCourtRule[] = Array.isArray(raw?.categoryCourts)
    ? raw.categoryCourts
        .filter((r: any) => r && typeof r.key === "string")
        .map((r: any) => {
          const out: CategoryCourtRule = { key: r.key, rule: r.rule === "only" ? "only" : "preferred", courtIds: ((r.courtIds ?? []) as any[]).map(Number).filter(Number.isFinite) };
          if (Array.isArray(r.weekdays)) out.weekdays = [...new Set((r.weekdays as any[]).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
          return out;
        })
    : [];
  return { rest, courts, categoryCourts, courtsPreBooked: raw?.courtsPreBooked === true };
}

/**
 * True when an existing booking is the club's own reservation for this tournament (so the games
 * go INTO it rather than treating it as a clash): Step-by-Step "sbs:" sessions, any booking when the
 * organiser ticked "courts already booked", or a booking whose booker/note names the tournament or
 * reads as a club-championship/tournament block (e.g. GoBook "Club Championships").
 */
export function isTournamentReservation(b: { external_id?: string | null; external_booker_name?: string | null; ops_note?: string | null; guest_name?: string | null }, tournamentName: string | null | undefined, preBooked = false): boolean {
  if (String(b.external_id ?? "").startsWith("sbs:")) return true;
  if (preBooked) return true;
  const norm = (x: any) => String(x ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const text = [b.external_booker_name, b.ops_note, b.guest_name].map(norm).join(" | ");
  if (!text.replace(/[ |]/g, "")) return false;
  const name = norm(tournamentName);
  if (name.length >= 4 && text.includes(name)) return true;
  return /\bclub champ|\bchampionships?\b|\btournament\b/.test(text);
}

/** True when the organiser chose anything other than the defaults. */
export function prefsActive(p: SchedulingPrefs): boolean {
  return p.rest !== "none" || p.courts !== "any";
}

/** Division label → unit key ("Mens › A · Doubles" → "Mens::A"). */
export const prefUnitKey = (label: string) => String(label ?? "").replace(/ · (Singles|Doubles|Singles and Doubles)$/i, "").split(" › ").join("::");

/** Effective rule for a label: exact label, then subcategory key, then parent category key. */
export function ruleForLabel(prefs: SchedulingPrefs, label: string | undefined): CategoryCourtRule | undefined {
  if (!label) return undefined;
  const k = prefUnitKey(label);
  const has = (r: CategoryCourtRule) => r.courtIds.length > 0 || (r.weekdays?.length ?? 0) > 0;
  for (const key of [label, k, k.split("::")[0]]) { const r = prefs.categoryCourts.find((x) => x.key === key && has(x)); if (r) return r; }
  return undefined;
}

export const weekdayOf = (iso: string) => new Date(`${String(iso).slice(0, 10)}T00:00:00`).getDay();

export type PrefGame = { id: string; round: number; people: string[]; groups: number[] };
export type PrefDay = { date: string; from: string; to: string; courtIds: number[] };
export type PrefBusy = { date: string; courtId: number; start: string; end: string };
export type PrefSlot = { id: string; date: string; time: string; courtId: number; round: number };
export type PrefPlan = { slots: PrefSlot[]; issues: string[]; notes: string[]; required: number; available: number; backToBack: number };

const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(":").map(Number); return h * 60 + (m || 0); };
const toHHMM = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/** Courts a game may use (hard) and would like (soft), from its categories' mappings. */
export function gameCourtRules(groups: number[], prefs: SchedulingPrefs, keyOf: (g: number) => string | undefined) {
  if (prefs.courts !== "category") return { only: null as number[] | null, preferred: [] as number[], onlyDays: null as number[] | null, preferredDays: null as number[] | null };
  const all = groups.map((g) => ruleForLabel(prefs, keyOf(g))).filter((r): r is CategoryCourtRule => !!r);
  const rules = all.filter((r) => r.courtIds.length > 0);
  const onlySets = rules.filter((r) => r.rule === "only").map((r) => r.courtIds);
  const only = onlySets.length ? onlySets.reduce((a, b) => a.filter((c) => b.includes(c))) : null;
  const preferred = [...new Set(rules.filter((r) => r.rule === "preferred").flatMap((r) => r.courtIds))];
  const dayRules = all.filter((r) => (r.weekdays?.length ?? 0) > 0);
  const onlyDaySets = dayRules.filter((r) => r.rule === "only").map((r) => r.weekdays!);
  const onlyDays = onlyDaySets.length ? onlyDaySets.reduce((a, b) => a.filter((d) => b.includes(d))) : null;
  const prefDaySets = dayRules.filter((r) => r.rule === "preferred").map((r) => r.weekdays!);
  const preferredDays = prefDaySets.length ? [...new Set(prefDaySets.flat())] : null;
  return { only, preferred, onlyDays, preferredDays };
}

function pack(o: { games: PrefGame[]; days: PrefDay[]; step: number; busy: PrefBusy[]; prefs: SchedulingPrefs; keyOf: (g: number) => string | undefined; rest: number; softDays: boolean }) {
  const queue = o.games.map((g, i) => ({ g, i, ...gameCourtRules(g.groups, o.prefs, o.keyOf) }));
  const reserved = new Set(o.prefs.courts === "category" ? o.prefs.categoryCourts.flatMap((r) => r.courtIds) : []);
  const last = new Map<string, { date: string; idx: number }>();
  const lastCourt = new Map<string, number>();
  const slots: PrefSlot[] = [];
  let available = 0;
  let backToBack = 0;
  for (const d of o.days) {
    const wd = weekdayOf(d.date);
    let idx = 0;
    for (let t = toMin(d.from); t + o.step <= toMin(d.to); t += o.step, idx++) {
      let free = d.courtIds.filter((c) => !o.busy.some((b) => b.date === d.date && b.courtId === c && toMin(b.start) < t + o.step && toMin(b.end) > t));
      available += free.length;
      const inWave = new Set<string>();
      for (let i = 0; i < queue.length && free.length; ) {
        const q = queue[i];
        const ps = q.g.people;
        if (ps.some((p) => inWave.has(p))) { i++; continue; }
        if (q.onlyDays && !q.onlyDays.includes(wd)) { i++; continue; }
        if (!o.softDays && q.preferredDays && !q.preferredDays.includes(wd)) { i++; continue; }
        if (o.rest > 0 && ps.some((p) => { const l = last.get(p); return !!l && l.date === d.date && idx - l.idx <= o.rest; })) { i++; continue; }
        const cands = q.only ? free.filter((c) => q.only!.includes(c)) : free;
        if (!cands.length) { i++; continue; }
        const score = (c: number) =>
          (q.preferred.includes(c) ? 8 : 0) +
          (o.prefs.courts === "rotate" ? ps.filter((p) => lastCourt.get(p) !== c).length : 0) +
          (o.prefs.courts === "category" && !q.preferred.includes(c) && !reserved.has(c) ? 1 : 0);
        const court = cands.reduce((best, c) => (score(c) > score(best) ? c : best), cands[0]);
        if (ps.some((p) => { const l = last.get(p); return !!l && l.date === d.date && l.idx === idx - 1; })) backToBack++;
        ps.forEach((p) => { inWave.add(p); last.set(p, { date: d.date, idx }); lastCourt.set(p, court); });
        free = free.filter((c) => c !== court);
        slots.push({ id: q.g.id, date: d.date, time: toHHMM(t), courtId: court, round: q.g.round });
        queue.splice(i, 1);
      }
    }
  }
  return { slots, left: queue, available, backToBack };
}

/**
 * Wave packer with preferences: each slot fills up to the free courts, games taken in round order.
 * "Avoid" = try with 1-slot rest first, fall back to no rest only if that is what it takes to fit.
 * All-or-nothing: any leftover game means no slots are returned.
 */
export function planPrefWaves(o: { games: PrefGame[]; days: PrefDay[]; minutes: number; bufferMinutes?: number; busy?: PrefBusy[]; prefs: SchedulingPrefs; keyOf: (g: number) => string | undefined }): PrefPlan {
  const step = Math.max(1, Number(o.minutes) || 0) + Math.max(0, o.bufferMinutes ?? 0);
  const days = [...o.days].filter((d) => d.courtIds.length && toMin(d.to) > toMin(d.from)).sort((a, b) => a.date.localeCompare(b.date) || toMin(a.from) - toMin(b.from));
  const games = [...o.games].map((g, i) => ({ g, i })).sort((a, b) => a.g.round - b.g.round || a.i - b.i).map((x) => x.g);
  const required = games.length;
  if (!days.length) return { slots: [], issues: ["No fixed match date with a time window and courts is configured."], notes: [], required, available: 0, backToBack: 0 };
  const base = { games, days, step, busy: o.busy ?? [], prefs: o.prefs, keyOf: o.keyOf };
  const notes: string[] = [];
  const hardRest = o.prefs.rest === "one" ? 1 : o.prefs.rest === "two" ? 2 : 0;
  const hasPrefDays = o.prefs.courts === "category" && o.prefs.categoryCourts.some((r) => r.rule === "preferred" && (r.weekdays?.length ?? 0) > 0);
  // Preferred evenings: honour them as if required first; spill to other evenings only when needed.
  const run = (rest: number) => {
    const strict = pack({ ...base, rest, softDays: false });
    if (!strict.left.length || !hasPrefDays) return { ...strict, spilled: false };
    return { ...pack({ ...base, rest, softDays: true }), spilled: true };
  };
  let res = run(o.prefs.rest === "avoid" ? 1 : hardRest);
  if (o.prefs.rest === "avoid") {
    if (res.left.length) { res = run(0); notes.push(res.backToBack ? `Back-to-back games needed to fit (${res.backToBack}).` : "Back-to-back avoided where possible."); }
    else notes.push("Back-to-back avoided.");
  } else if (hardRest) notes.push(`At least ${hardRest} slot${hardRest === 1 ? "" : "s"} rest between games.`);
  if (o.prefs.courts === "rotate") notes.push("Courts rotated where possible.");
  if (o.prefs.courts === "category" && o.prefs.categoryCourts.some((r) => r.courtIds.length)) notes.push("Category/group courts applied.");
  if (o.prefs.courts === "category" && o.prefs.categoryCourts.some((r) => (r.weekdays?.length ?? 0) > 0)) notes.push(res.spilled ? "Preferred evenings were full, so some games moved to other evenings." : "Category evenings applied.");
  const issues: string[] = [];
  if (res.left.length) {
    const n = res.left.length;
    const noDay = res.left.filter((q) => q.onlyDays && !days.some((d) => q.onlyDays!.includes(weekdayOf(d.date))));
    const dayLeft = res.left.filter((q) => q.onlyDays);
    const impossible = res.left.filter((q) => q.only && !q.only.some((c) => days.some((d) => d.courtIds.includes(c))));
    const onlyLeft = res.left.filter((q) => q.only);
    const s = n === 1 ? "match" : "matches";
    if (noDay.length) issues.push(`"Only these evenings" leaves ${noDay.length} ${noDay.length === 1 ? "match" : "matches"} with no planned date on those weekdays. Change the rule to Preferred or pick another evening.`);
    else if (impossible.length) issues.push(`"Only these courts" leaves ${impossible.length} ${impossible.length === 1 ? "match" : "matches"} with no usable court on the configured dates. Change the court rule to Preferred or pick courts available on those dates.`);
    else if (hardRest) issues.push(`Requiring ${hardRest}-slot rest leaves ${n} ${s} that cannot fit. Change rest to "Avoid back-to-back", extend the window, or add another date.`);
    else if (dayLeft.length && !onlyLeft.length) issues.push(`"Only these evenings" leaves ${n} ${s} that cannot fit. Change the rule to Preferred, extend the window, or add another date.`);
    else if (onlyLeft.length) issues.push(`"Only these courts" leaves ${n} ${s} that cannot fit. Change the court rule to Preferred, extend the window, or add another date.`);
    else issues.push(`${required} games need a slot but only ${required - n} could be placed (${res.available} court slots, ${step} min per slot, no player on two courts at once). Extend the window, add courts or add another date.`);
  }
  return { slots: issues.length ? [] : res.slots, issues, notes, required, available: res.available, backToBack: res.backToBack };
}
