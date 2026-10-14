/**
 * Fixed-position Swiss — FULL DRAW (Riverside pilot, pure, no I/O).
 *
 * The whole draw is generated ONCE per category from the tested slot templates in `swiss-positional.ts`:
 * every round's fixtures are known up front as "Position X vs Position Y". Players are resolved into
 * those positions as confirmed results arrive (winner → better/lower-numbered slot, loser → worse slot).
 * A slot in round r+1 is fed by exactly one round-r match (or the bye), so a name appears as soon as
 * that single feeder match is decided — nothing is re-drawn between rounds.
 *
 * Fixed draw ⇒ no bye-fairness or rematch swaps (those would change fixtures after generation).
 * The odd-entrant bye always belongs to the last slot; repeats are reported, not hidden.
 *
 * Scheduling only attaches organiser-supplied windows (round date, start times, courts) as PLANNED
 * slots or play-by deadlines. It never books courts and reports every fixture it cannot place.
 */
import { categoryTemplate, planCategory, validateTemplate } from "./swiss-positional";

export interface DrawEntrant { id: string; name: string }              // index = seed - 1
export interface DrawFixture { key: string; round: number; match: number; slotA: number; slotB: number }
export interface CategoryDraw {
  categoryKey: string;
  label: string;
  rounds: number;
  entrants: DrawEntrant[];
  fixtures: DrawFixture[];
  byes: Array<{ round: number; slot: number }>;
  issues: string[];
}
export type ResultSide = "a" | "b";
export interface DrawResult { winner: ResultSide; score?: string | null }
export type DrawResults = Record<string, DrawResult>;

export const fixtureKey = (round: number, slotA: number, slotB: number) => `r${round}-${slotA}v${slotB}`;
export const positionLabel = (slotA: number, slotB: number) => `Position ${slotA} vs Position ${slotB} (TBD)`;

/** Generate every round of one category's draw. Each category passes its OWN entrants and round count. */
export function generateCategoryDraw(input: { categoryKey: string; label: string; entrants: DrawEntrant[]; rounds: number }): CategoryDraw {
  const n = input.entrants.length;
  const plan = planCategory(n, input.rounds);
  const issues = [...plan.issues];
  if (new Set(input.entrants.map((e) => e.id)).size !== n) issues.push("Each entrant may appear only once.");
  const base = { categoryKey: input.categoryKey, label: input.label, rounds: input.rounds, entrants: input.entrants };
  if (issues.length) return { ...base, fixtures: [], byes: [], issues };
  const tpl = categoryTemplate(n, input.rounds);
  const bad = validateTemplate(n, tpl);
  if (bad.length) return { ...base, fixtures: [], byes: [], issues: bad };
  const fixtures: DrawFixture[] = [];
  const byes: CategoryDraw["byes"] = [];
  for (const r of tpl) {
    r.pairs.forEach((p, i) => fixtures.push({ key: fixtureKey(r.round, p.a, p.b), round: r.round, match: i + 1, slotA: p.a, slotB: p.b }));
    if (r.bye != null) byes.push({ round: r.round, slot: r.bye });
  }
  return { ...base, fixtures, byes, issues: [] };
}

export type FixtureStatus = "decided" | "ready" | "awaiting";
export interface ResolvedFixture extends DrawFixture {
  a: DrawEntrant | null;
  b: DrawEntrant | null;
  status: FixtureStatus;
  winner: ResultSide | null;
  score: string | null;
  label: string;           // "Name vs Name" or "Position X vs Position Y (TBD)" style
}
export interface ResolvedDraw {
  rounds: Array<{ round: number; fixtures: ResolvedFixture[]; bye: { slot: number; entrant: DrawEntrant | null } | null }>;
  /** Occupants going INTO each round (index 0 = round 1 = seed order); last entry = after the final round. */
  occupancy: Array<Array<DrawEntrant | null>>;
  finalRanking: Array<{ position: number; entrant: DrawEntrant | null }>;
  rematches: Array<{ key: string; a: string; b: string }>;
  issues: string[];
}

/** Resolve names into positions from confirmed results. Pure and deterministic. */
export function resolveCategoryDraw(draw: CategoryDraw, results: DrawResults = {}): ResolvedDraw {
  const n = draw.entrants.length;
  const issues: string[] = [];
  const occupancy: Array<Array<DrawEntrant | null>> = [draw.entrants.map((e) => e)];
  const rounds: ResolvedDraw["rounds"] = [];
  const met = new Set<string>();
  const rematches: ResolvedDraw["rematches"] = [];
  const pk = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  for (let r = 1; r <= draw.rounds; r++) {
    const cur = occupancy[r - 1];
    const next: Array<DrawEntrant | null> = Array(n).fill(null);
    const fixtures = draw.fixtures.filter((f) => f.round === r).map<ResolvedFixture>((f) => {
      const a = cur[f.slotA - 1], b = cur[f.slotB - 1];
      const res = results[f.key];
      if (a && b && met.has(pk(a.id, b.id))) rematches.push({ key: f.key, a: a.id, b: b.id });
      if (a && b) met.add(pk(a.id, b.id));
      if (res && !(a && b)) issues.push(`${f.key}: result saved before both players were known — ignored.`);
      const decided = !!res && !!a && !!b;
      if (decided) {
        const w = res.winner === "a" ? a : b, l = res.winner === "a" ? b : a;
        next[f.slotA - 1] = w; next[f.slotB - 1] = l;            // winner → better slot, loser → worse slot
      }
      return {
        ...f, a, b, status: decided ? "decided" : a && b ? "ready" : "awaiting",
        winner: decided ? res.winner : null, score: decided ? res.score ?? null : null,
        label: `${a ? a.name : `Position ${f.slotA}`} vs ${b ? b.name : `Position ${f.slotB}`}${a && b ? "" : " (TBD)"}`,
      };
    });
    const byeSlot = draw.byes.find((y) => y.round === r)?.slot ?? null;
    if (byeSlot != null) next[byeSlot - 1] = cur[byeSlot - 1];
    rounds.push({ round: r, fixtures, bye: byeSlot != null ? { slot: byeSlot, entrant: cur[byeSlot - 1] } : null });
    occupancy.push(next);
  }
  const last = occupancy[occupancy.length - 1];
  return { rounds, occupancy, finalRanking: last.map((entrant, i) => ({ position: i + 1, entrant })), rematches, issues };
}

/**
 * Record one confirmed result. Allowed only when both players are known. Idempotent for the same winner;
 * changing a decided result is refused once any later fixture fed by it has been decided.
 */
export function recordDrawResult(draw: CategoryDraw, results: DrawResults, key: string, winner: ResultSide, score?: string | null): DrawResults {
  const f = draw.fixtures.find((x) => x.key === key);
  if (!f) throw new Error("Unknown fixture.");
  const resolved = resolveCategoryDraw(draw, results);
  const rf = resolved.rounds[f.round - 1].fixtures.find((x) => x.key === key)!;
  if (!rf.a || !rf.b) throw new Error("Both players must be known before a result can be recorded.");
  const prev = results[key];
  if (prev && prev.winner === winner && (score ?? null) === (prev.score ?? null)) return results;
  if (prev && prev.winner !== winner) {
    const later = draw.fixtures.some((x) => x.round === f.round + 1 && [x.slotA, x.slotB].some((s) => s === f.slotA || s === f.slotB) && results[x.key]);
    if (later) throw new Error("A later match fed by this result is already decided; correct that first.");
  }
  return { ...results, [key]: { winner, score: score ?? null } };
}

/* ------------------------------------------------------------------ scheduling */

export interface ScheduleOptions {
  /** Per category: date (YYYY-MM-DD) for each round, index 0 = round 1. Missing = no date. */
  roundDates: Record<string, Array<string | null | undefined>>;
  /** Per category: optional play-by date per round, used when a round has no fixed date. */
  playBy?: Record<string, Array<string | null | undefined>>;
  courts: Array<{ id: string | number; name: string }>;
  /** Start times available on each round date, "HH:MM". */
  times: string[];
  matchMinutes: number;
  restMinutes: number;
  /** Existing saved bookings / blocked court-times to avoid. */
  busy?: Array<{ date: string; time: string; courtId: string | number }>;
}
export type FixtureSchedule =
  | { kind: "planned"; date: string; time: string; courtId: string | number; courtName: string }
  | { kind: "play_by"; date: string }
  | { kind: "unscheduled"; reason: string };

const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };

/** Attach planned court/time windows to fixed fixtures across categories. Never invents a booking. */
export function scheduleDraws(draws: CategoryDraw[], opts: ScheduleOptions): Record<string, FixtureSchedule> {
  const out: Record<string, FixtureSchedule> = {};
  const used = new Set<string>((opts.busy ?? []).map((b) => `${b.date}|${mins(b.time)}|${b.courtId}`));
  const times = [...new Set(opts.times)].map(mins).sort((x, y) => x - y);
  // readiness[category][round][slot] = { date, minute } when that slot's player is free for this round.
  const ready = new Map<string, { date: string; at: number }>();
  const rk = (c: string, r: number, s: number) => `${c}|${r}|${s}`;
  const queue = draws.flatMap((d) => d.fixtures.map((f) => ({ d, f })))
    .sort((x, y) => x.f.round - y.f.round || x.f.match - y.f.match || x.d.categoryKey.localeCompare(y.d.categoryKey));
  for (const { d, f } of queue) {
    const key = `${d.categoryKey}:${f.key}`;
    const date = opts.roundDates[d.categoryKey]?.[f.round - 1] ?? null;
    const carryBye = () => {
      const bye = d.byes.find((y) => y.round === f.round);
      if (bye) { const rr = ready.get(rk(d.categoryKey, f.round, bye.slot)); if (rr) ready.set(rk(d.categoryKey, f.round + 1, bye.slot), rr); }
    };
    if (!date) {
      const pb = opts.playBy?.[d.categoryKey]?.[f.round - 1];
      out[key] = pb ? { kind: "play_by", date: pb } : { kind: "unscheduled", reason: "Not scheduled — no round date" };
      carryBye(); continue;
    }
    const earliest = Math.max(...[f.slotA, f.slotB].map((s) => { const r = ready.get(rk(d.categoryKey, f.round, s)); return r && r.date === date ? r.at : -1; }));
    let placed: FixtureSchedule | null = null;
    for (const t of times) {
      if (t < earliest) continue;
      const court = opts.courts.find((c) => !used.has(`${date}|${t}|${c.id}`));
      if (!court) continue;
      used.add(`${date}|${t}|${court.id}`);
      const hh = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
      placed = { kind: "planned", date, time: hh, courtId: court.id, courtName: court.name };
      const free = { date, at: t + opts.matchMinutes + opts.restMinutes };
      ready.set(rk(d.categoryKey, f.round + 1, f.slotA), free);
      ready.set(rk(d.categoryKey, f.round + 1, f.slotB), free);
      break;
    }
    out[key] = placed ?? { kind: "unscheduled", reason: opts.courts.length && times.length ? "Not scheduled — no free court/time with rest" : "Not scheduled — no courts or times" };
    carryBye();
  }
  return out;
}

/** Independent check used by tests and the UI: double-booked courts and rest violations. */
export function scheduleConflicts(draws: CategoryDraw[], sched: Record<string, FixtureSchedule>, opts: Pick<ScheduleOptions, "matchMinutes" | "restMinutes" | "busy">): string[] {
  const out: string[] = [];
  const seen = new Map<string, string>();
  for (const b of opts.busy ?? []) seen.set(`${b.date}|${mins(b.time)}|${b.courtId}`, "existing booking");
  for (const d of draws) for (const f of d.fixtures) {
    const s = sched[`${d.categoryKey}:${f.key}`];
    if (s?.kind !== "planned") continue;
    const k = `${s.date}|${mins(s.time)}|${s.courtId}`;
    if (seen.has(k)) out.push(`${d.categoryKey}:${f.key} clashes with ${seen.get(k)}`);
    seen.set(k, `${d.categoryKey}:${f.key}`);
    if (f.round > 1) {
      for (const slot of [f.slotA, f.slotB]) {
        const feeder = d.fixtures.find((x) => x.round === f.round - 1 && (x.slotA === slot || x.slotB === slot));
        const fs = feeder && sched[`${d.categoryKey}:${feeder.key}`];
        if (fs?.kind === "planned" && fs.date === s.date && mins(fs.time) + opts.matchMinutes + opts.restMinutes > mins(s.time))
          out.push(`${d.categoryKey}:${f.key} starts before position ${slot} has rested`);
      }
    }
  }
  return out;
}
