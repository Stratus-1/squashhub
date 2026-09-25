import { gameLabel, opponentPositions } from "./ties";
/**
 * Diamond League — pure engine pieces + reusable template.
 *
 * General building blocks, not Uitsig-only:
 *  - admission: capacity + first-confirmed + waiting list
 *  - snake allocation across every pool of every division
 *  - cross-pool league: same pool position plays the same position in each other pool,
 *    one pool-v-pool pairing per round (circle rotation)
 *  - position-based pair forming inside a pool; the SOURCE order (seed vs prior-stage
 *    standings) is an explicit setting and stays unresolved until the organiser confirms
 *  - crossover play-offs between confirmed pool pairs (A#1 v B#2, B#1 v A#2, A#3 v B#4, B#3 v A#4)
 *  - home courts per pool pair, and schedule feasibility against real evenings × courts
 *
 * Nothing here invents a points formula, tie-break or final. Where those are needed the
 * functions return a `blocked` reason instead of guessing.
 */
import { newId, type Division, type OpenQuestion, type Stage, type TournamentDefinition } from "./definition";

export const DIAMOND_KEY = "diamond_league";
export const poolLetter = (i: number) => String.fromCharCode(65 + i);
export const poolName = (d: Pick<Division, "poolNames">, i: number) => d.poolNames?.[i]?.trim() || `Pool ${poolLetter(i)}`;

// ── Admission ────────────────────────────────────────────────────────────────
export interface Registration { id: string; confirmedAt: string | null }
export function admit(regs: Registration[], capacity: number | null | undefined) {
  const confirmed = regs.filter((r) => r.confirmedAt).sort((a, b) => a.confirmedAt!.localeCompare(b.confirmedAt!) || a.id.localeCompare(b.id));
  const cap = capacity ?? Infinity;
  return {
    accepted: confirmed.slice(0, cap).map((r) => r.id),
    waitlist: confirmed.slice(cap).map((r) => r.id),
    unconfirmed: regs.filter((r) => !r.confirmedAt).map((r) => r.id),
  };
}

// ── Snake allocation across all pools (divisions × poolsPerDivision) ─────────
/** `seeded` strongest first. Returns [division][pool] = ids in seed order (index = pool position − 1). */
export function snakeAllocate(seeded: string[], divisions: number, poolsPerDivision: number, poolSize: number): string[][][] {
  const total = divisions * poolsPerDivision;
  const flat: string[][] = Array.from({ length: total }, () => []);
  seeded.slice(0, total * poolSize).forEach((id, i) => {
    const lap = Math.floor(i / total), k = i % total;
    flat[lap % 2 === 0 ? k : total - 1 - k].push(id);
  });
  return Array.from({ length: divisions }, (_, d) => flat.slice(d * poolsPerDivision, (d + 1) * poolsPerDivision));
}

// ── Cross-pool rotation ──────────────────────────────────────────────────────
/** Circle method over pool indexes: every pool meets every other pool exactly once. 4 pools → [[0,1],[2,3]], [[0,2],[1,3]], [[0,3],[1,2]]. */
export function poolRotation(pools: number): Array<Array<[number, number]>> {
  const ids = Array.from({ length: pools % 2 ? pools + 1 : pools }, (_, i) => i);
  const n = ids.length, rounds: Array<Array<[number, number]>> = [];
  const fixed = ids[0]; let rest = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const line = [fixed, ...rest], pairs: Array<[number, number]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = line[i], b = line[n - 1 - i];
      if (a < pools && b < pools) pairs.push(a < b ? [a, b] : [b, a]);
    }
    rounds.push(pairs.sort((x, y) => x[0] - y[0]));
    rest = [rest[rest.length - 1], ...rest.slice(0, -1)];
  }
  // A v B, then A v C, then A v D (organiser's order).
  const opp = (r: Array<[number, number]>) => r.find((p) => p[0] === 0)?.[1] ?? 99;
  return rounds.sort((x, y) => opp(x) - opp(y));
}

export interface CrossPoolFixture { round: number; poolA: number; poolB: number; position: number; a: string | null; b: string | null }
/** units[pool][position-1] = entrant id (player or "p1+p2" pair). Missing slots stay null (reported, never filled). */
export function crossPoolFixtures(units: (string | null)[][]): CrossPoolFixture[] {
  const out: CrossPoolFixture[] = [];
  const size = Math.max(0, ...units.map((u) => u.length));
  poolRotation(units.length).forEach((pairs, r) => pairs.forEach(([pa, pb]) => {
    for (let pos = 0; pos < size; pos++) out.push({ round: r + 1, poolA: pa, poolB: pb, position: pos + 1, a: units[pa][pos] ?? null, b: units[pb][pos] ?? null });
  }));
  return out;
}

// ── Position-based pairs ─────────────────────────────────────────────────────
export type PairResult = { ok: true; pairs: string[] } | { ok: false; blocked: string };
/**
 * Build pairs 1+2, 3+4, 5+6 inside ONE pool from an explicit order.
 * `source` must be confirmed; with prior-stage standings a complete, tie-free ranking is required.
 */
export function pairsForPool(opts: {
  source: "seed" | "prior_stage_standings" | null | undefined;
  seedOrder: string[];
  /** Ranked order from prior-stage standings, or null when it cannot be decided (formula/tie-break missing, games unfinished). */
  standingsOrder?: string[] | null;
  positions?: number[][];
}): PairResult {
  if (!opts.source) return { ok: false, blocked: "It isn't confirmed whether pairs come from the seeded positions or from the re-ranked singles standings." };
  const order = opts.source === "seed" ? opts.seedOrder : opts.standingsOrder;
  if (!order) return { ok: false, blocked: "The pool can't be re-ranked from singles yet: the points formula / tie-break isn't confirmed, or games are unfinished." };
  const positions = opts.positions ?? [[1, 2], [3, 4], [5, 6]];
  const pairs: string[] = [];
  for (const [x, y] of positions) {
    const a = order[x - 1], b = order[y - 1];
    if (!a || !b) return { ok: false, blocked: `Positions ${x} and ${y} aren't both filled, so a whole pair can't be formed.` };
    pairs.push(`${a}+${b}`);
  }
  return { ok: true, pairs };
}

/** Rank a pool from points, refusing when there's no confirmed formula or when a tie has no confirmed tie-break. */
export function rankFromPoints(ids: string[], points: Map<string, number> | null, tieBreak: ((a: string, b: string) => number) | null): string[] | null {
  if (!points) return null;
  const sorted = [...ids].sort((a, b) => (points.get(b) ?? 0) - (points.get(a) ?? 0));
  for (let i = 1; i < sorted.length; i++) {
    if ((points.get(sorted[i]) ?? 0) === (points.get(sorted[i - 1]) ?? 0)) {
      if (!tieBreak) return null;
      const c = tieBreak(sorted[i - 1], sorted[i]);
      if (c === 0) return null;
      if (c > 0) [sorted[i - 1], sorted[i]] = [sorted[i], sorted[i - 1]];
    }
  }
  return sorted;
}

// ── Crossover play-offs ──────────────────────────────────────────────────────
export interface CrossoverSlot { poolIndex: number; position: number }
/** For each confirmed pool pair (i, j): i#1 v j#2, j#1 v i#2, i#3 v j#4, j#3 v i#4. Positions 5/6 are left to the organiser. */
export function crossoverSemis(pairs: Array<[number, number]>, blocks: Array<[number, number]> = [[1, 2], [3, 4]]) {
  return pairs.flatMap(([i, j]) => blocks.flatMap(([hi, lo]) => [
    { block: `${hi}/${lo}`, a: { poolIndex: i, position: hi }, b: { poolIndex: j, position: lo } },
    { block: `${hi}/${lo}`, a: { poolIndex: j, position: hi }, b: { poolIndex: i, position: lo } },
  ]));
}

// ── Home courts + schedule feasibility ───────────────────────────────────────
export function homeCourt(d: Pick<Division, "poolGroups">, poolA: number, poolB: number): string | null {
  const g = d.poolGroups ?? [];
  const hit = g.find((x) => x.pools.includes(poolA) && x.pools.includes(poolB)) ?? g.find((x) => x.pools.includes(poolA));
  return hit?.court ?? null;
}

export interface EveningCheck {
  state: "feasible" | "infeasible" | "incomplete";
  detail: string;
  perCourt: Record<string, number>;
  slotsPerCourt: number | null;
}
/** One evening's games vs its courts: games per court must fit in session ÷ match minutes. */
export function eveningFeasibility(courtOfGame: (string | null)[], sessionMinutes: number | null | undefined, matchMinutes: number | null | undefined): EveningCheck {
  const perCourt: Record<string, number> = {};
  for (const c of courtOfGame) perCourt[c ?? "unassigned"] = (perCourt[c ?? "unassigned"] ?? 0) + 1;
  if (perCourt.unassigned) return { state: "incomplete", detail: `${perCourt.unassigned} games have no court.`, perCourt, slotsPerCourt: null };
  if (!sessionMinutes || !matchMinutes) return { state: "incomplete", detail: "Evening length and game length aren't set, so capacity can't be checked.", perCourt, slotsPerCourt: null };
  const slots = Math.floor(sessionMinutes / matchMinutes);
  const worst = Math.max(0, ...Object.values(perCourt));
  return worst <= slots
    ? { state: "feasible", detail: `Busiest court has ${worst} games; ${slots} fit.`, perCourt, slotsPerCourt: slots }
    : { state: "infeasible", detail: `A court needs ${worst} games but only ${slots} fit in the evening.`, perCourt, slotsPerCourt: slots };
}

/** Consecutive weekly dates from a start (YYYY-MM-DD). */
export function weeklyDates(start: string, count: number): string[] {
  const d = new Date(`${start}T12:00:00Z`);
  return Array.from({ length: count }, (_, i) => new Date(d.getTime() + i * 7 * 864e5).toISOString().slice(0, 10));
}

// ── Pool-v-pool ties (compound fixtures) ─────────────────────────────────────
export type TieFormat = NonNullable<Stage["tieFormat"]>;
/** Diamond League tie: 6 singles @20 then 3 doubles @30, same court, in order. */
export const DIAMOND_TIE: TieFormat = {
  sameCourt: true,
  pairing: "position",
  startTime: null,
  rubbers: [
    ...[1, 2, 3, 4, 5, 6].map((p) => ({ discipline: "singles" as const, positions: [p], minutes: 20 })),
    ...[[1, 2], [3, 4], [5, 6]].map((p) => ({ discipline: "doubles" as const, positions: p, minutes: 30 })),
  ],
};
/** Stage 1 of each weekly session: 6 singles @20 min. */
export const DIAMOND_SINGLES_TIE: TieFormat = { sameCourt: true, pairing: "position", startTime: null, rubbers: DIAMOND_TIE.rubbers.filter((r) => r.discipline === "singles") };
/** Stage 2, same session, straight after: 3 doubles @30 min (pool positions 1+2, 3+4, 5+6). */
export const DIAMOND_DOUBLES_TIE: TieFormat = { sameCourt: true, pairing: "position", startTime: null, rubbers: DIAMOND_TIE.rubbers.filter((r) => r.discipline === "doubles") };
export const tieMinutes = (t: TieFormat) => t.rubbers.reduce((n, r) => n + r.minutes, 0);
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const rubberLabel = (r: TieFormat["rubbers"][number], pairing: TieFormat["pairing"] = "position") => gameLabel(r, pairing ?? "position");

/** Ordered rubber slots for one tie from a start time (null start = durations only). */
export function tieSlots(t: TieFormat, start?: string | null) {
  let at = start ? toMin(start) : 0;
  return t.rubbers.map((r, i) => { const s = at; at += r.minutes; return { order: i + 1, ...r, positionsB: opponentPositions(r, t.pairing ?? "position") ?? r.positions, start: start ? hhmm(s) : null, end: start ? hhmm(at) : null }; });
}
export const tieFinish = (t: TieFormat, start: string) => hhmm(toMin(start) + tieMinutes(t));

/** Court for the k-th tie of a division's evening: its home group when both pools share one, otherwise the k-th group's court so simultaneous ties never share a court. */
export function tieCourt(d: Pick<Division, "poolGroups">, a: number, b: number, k: number): string | null {
  const g = d.poolGroups ?? [];
  return g.find((x) => x.pools.includes(a) && x.pools.includes(b))?.court ?? g[k]?.court ?? null;
}

export interface Tie {
  round: number; division: number; poolA: number; poolB: number; court: string | null;
  rubbers: Array<{ order: number; discipline: "singles" | "doubles"; positions: number[]; positionsB: number[]; minutes: number; start: string | null; end: string | null; a: string | null; b: string | null }>;
}
/**
 * Round-robin of pool-v-pool ties inside each division (circle rotation — every pool meets every other once).
 * `pools[division][pool][position-1]` = player id. Rubbers keep their tie, court and evening.
 */
export function buildTies(pools: (string | null)[][][], divisions: Pick<Division, "poolGroups">[], t: TieFormat): Tie[] {
  const out: Tie[] = [];
  pools.forEach((dp, di) => poolRotation(dp.length).forEach((pairs, r) => pairs.forEach(([pa, pb], k) => {
    const side = (pi: number, pos: number[]) => pos.every((p) => dp[pi]?.[p - 1]) ? pos.map((p) => dp[pi][p - 1]).join("+") : null;
    out.push({
      round: r + 1, division: di, poolA: pa, poolB: pb, court: divisions[di] ? tieCourt(divisions[di], pa, pb, k) : null,
      rubbers: tieSlots(t, t.startTime).map((s) => ({ ...s, discipline: s.discipline!, positions: s.positions!, minutes: s.minutes!, a: side(pa, s.positions!), b: side(pb, s.positionsB) })),
    });
  })));
  return out;
}

/** Schedule maths per evening: ties on one court run back to back; must fit before the evening ends. */
export function tieEveningCheck(ties: Pick<Tie, "court">[], t: TieFormat, eveningEnd?: string | null): EveningCheck & { finish: string | null; tieMinutes: number } {
  const perCourt: Record<string, number> = {};
  for (const x of ties) perCourt[x.court ?? "unassigned"] = (perCourt[x.court ?? "unassigned"] ?? 0) + 1;
  const mins = tieMinutes(t);
  const base = { perCourt, tieMinutes: mins, slotsPerCourt: null as number | null };
  if (perCourt.unassigned) return { ...base, state: "incomplete", detail: `${perCourt.unassigned} ties have no court.`, finish: null };
  const worst = Math.max(0, ...Object.values(perCourt));
  if (!t.startTime) return { ...base, state: "incomplete", detail: `Each tie needs ${mins} min of court time; set a start time to check the evening.`, finish: null };
  const finish = hhmm(toMin(t.startTime) + worst * mins);
  if (!eveningEnd) return { ...base, state: "feasible", detail: `${worst} tie per court · ${t.startTime}–${finish}.`, finish };
  const ok = toMin(t.startTime) + worst * mins <= toMin(eveningEnd);
  return { ...base, state: ok ? "feasible" : "infeasible", detail: ok ? `${t.startTime}–${finish}, fits before ${eveningEnd}.` : `Busiest court finishes ${finish}, after ${eveningEnd}.`, finish };
}

// ── Open questions (Review "Needs organiser confirmation") ───────────────────
export const DIAMOND_QUESTIONS: OpenQuestion[] = [
  { id: "dl_points", term: "Points", question: "What points does each singles and doubles rubber (and each tie) earn, and what breaks ties in the standings?", kind: "structural", resolved: false, answer: null },
  { id: "dl_semis", term: "Semi-finals", question: "Semi-final rules (Wednesday 4): who qualifies, the crossover, and what each semi-final contains.", kind: "structural", resolved: false, answer: null },
  { id: "dl_final", term: "Finals", question: "Final rules (Wednesday 5): what is played, placement games, and how the overall winner is decided.", kind: "structural", resolved: false, answer: null },
];

// ── Template ─────────────────────────────────────────────────────────────────
function stage(name: string, kind: Stage["kind"], discipline: "singles" | "doubles", extra: Partial<Stage> = {}): Stage {
  return {
    id: newId("stage"), name, kind, discipline, groups: 4, groupSize: 6, input: {}, advance: { role: "none" },
    schedule: { mode: "unset" }, ...extra,
  } as Stage;
}

export const DIAMOND_INSTANCE_FIELDS = ["name", "scheduleDefaults", "admission", "divisions.poolNames", "divisions.poolGroups.court", "tieFormat.startTime", "scoring", "event"];
export const DIAMOND_WEDNESDAYS = weeklyDates("2026-10-07", 5);

/** Builds the Diamond League structure into `def` (replacing its divisions). */
export function applyDiamondLeague(def: TournamentDefinition, opts: { courts?: string[][]; startDate?: string | null; startTime?: string | null } = {}) {
  const courts = opts.courts ?? [["Court 1", "Court 2"], ["Court 3", "Court 4"]];
  const dates = opts.startDate === null ? [] : weeklyDates(opts.startDate ?? "2026-10-07", 5);
  def.name = def.name && def.name !== "Untitled tournament" ? def.name : "Diamond League";
  def.category = "open";
  def.quickPath = "custom";
  def.finalStandings = "cumulative";
  def.admission = { capacity: 48, mode: "first_confirmed", waitlist: true };
  def.poolSeeding = { source: "ladder", allocation: "snake", scope: "tournament" };
  def.pairSource = "seed"; // doubles = pool positions 1+2 / 3+4 / 5+6 in each weekly tie
  def.templateMeta = { key: DIAMOND_KEY, name: "Diamond League", instanceFields: DIAMOND_INSTANCE_FIELDS };
  def.scheduleDefaults = { ...(def.scheduleDefaults ?? {}), weekday: 3, startDate: dates[0] ?? null, endDate: dates[4] ?? null } as TournamentDefinition["scheduleDefaults"];
  const fixed = (from: number, to: number) => dates.length
    ? { mode: "fixed" as const, startDate: dates[from], endDate: dates[to], roundDates: dates.slice(from, to + 1), weekday: 3 }
    : { mode: "unset" as const };
  def.divisions = [0, 1].map((di) => {
    // One weekly SESSION (same date, same court per tie) holds two sequential stages.
    const s1 = stage("Singles", "cross_pool_league", "singles", {
      input: { entrants: 24 }, legs: 1,
      scoring: { mode: "time_capped_points", timeCapMinutes: 20 },
      tieFormat: { ...DIAMOND_SINGLES_TIE, startTime: opts.startTime === undefined ? "17:45" : opts.startTime },
      notes: "Each Wednesday every pool plays one other pool on its home court: 6 singles, same positions (1v1…6v6), 20 min each.",
      schedule: fixed(0, 2),
    });
    const s2 = stage("Doubles", "cross_pool_league", "doubles", {
      input: { fromStageId: s1.id }, legs: 1, sameSessionAs: s1.id,
      progression: { mode: "form_pairs", pairing: "positions", standings: "carry" },
      scoring: { mode: "time_capped_points", timeCapMinutes: 30 },
      tieFormat: { ...DIAMOND_DOUBLES_TIE },
      notes: "Same evening, same court, straight after the singles: 3 doubles, pool positions 1+2, 3+4, 5+6 v the same pair, 30 min each.",
      schedule: fixed(0, 2),
    });
    const s3 = stage("Semi-finals", "knockout", "singles", {
      groups: 1, groupSize: null, input: { fromStageId: s2.id }, generation: "owner_approval", dynamic: true,
      notes: "Semi-final rules need confirmation (organiser spreadsheet).", schedule: fixed(3, 3),
    });
    const s4 = stage("Finals", "knockout", "singles", {
      groups: 1, groupSize: null, input: { fromStageId: s3.id }, generation: "owner_approval", dynamic: true,
      notes: "Final rules need confirmation (organiser spreadsheet).", schedule: fixed(4, 4),
    });
    return {
      id: newId("div"), name: `Division ${di + 1}`, eligibility: "open", entry: "individual", leagueUse: null,
      poolNames: ["", "", "", ""],
      poolGroups: [{ pools: [0, 1], court: courts[di][0] }, { pools: [2, 3], court: courts[di][1] }],
      sections: [{ id: newId("sec"), name: "Main", stages: [s1, s2, s3, s4] }],
    } as unknown as Division;
  });
  const keep = def.questions.filter((q) => !q.id.startsWith("dl_"));
  def.questions = [...keep, ...DIAMOND_QUESTIONS.map((q) => ({ ...q }))];
  return def;
}

/** Strip per-instance settings so the saved template keeps only the competition logic. */
export function toTemplate(def: TournamentDefinition): TournamentDefinition {
  const t: TournamentDefinition = JSON.parse(JSON.stringify(def));
  t.scheduleDefaults = {} as TournamentDefinition["scheduleDefaults"];
  for (const d of t.divisions) {
    d.poolNames = d.poolNames?.map(() => "");
    for (const s of d.sections.flatMap((x) => x.stages)) {
      s.schedule = { mode: "unset" };
      if (s.tieFormat) s.tieFormat.startTime = null;
    }
  }
  t.questions = t.questions.map((q) => ({ ...q, resolved: false, answer: null }));
  return t;
}

export const diamondTieStage = (d: Division) => d.sections.flatMap((x) => x.stages).find((s) => s.tieFormat && !s.sameSessionAs);

/** The whole weekly session as one ordered tie: leader stage's rubbers, then each same-session stage's. */
export function sessionTie(def: TournamentDefinition): TieFormat {
  const d = def.divisions.find(diamondTieStage);
  const lead = d && diamondTieStage(d);
  if (!d || !lead?.tieFormat) return DIAMOND_TIE;
  const stages = d.sections.flatMap((x) => x.stages);
  const withB = (st: Stage) => (st.tieFormat?.rubbers ?? []).map((r) => ({ ...r, positionsB: opponentPositions(r, st.tieFormat?.pairing ?? "position") ?? r.positions }));
  const rubbers = withB(lead);
  for (let cur = lead, next = stages.find((s) => s.sameSessionAs === cur.id); next; cur = next, next = stages.find((s) => s.sameSessionAs === cur.id))
    rubbers.push(...withB(next));
  return { sameCourt: true, pairing: "custom", startTime: lead.tieFormat.startTime ?? null, rubbers };
}

/** Plain chain for the builder map. */
export function diamondChain(def: TournamentDefinition): string[] {
  const t = sessionTie(def);
  const m = tieMinutes(t);
  return [
    `Registration: first ${def.admission?.capacity ?? "—"} confirmed accepted, rest wait-listed`,
    "Ladder seeding (admin can adjust) → snake into 8 pools of 6 (2 divisions × 4 pools)",
    "Wednesdays 1–3: each pool plays each other pool in its division once (4 ties per evening, one per court)",
    `Each Wednesday is one session with two stages on the same court: Singles (6 × 20 min) then Doubles (1+2 / 3+4 / 5+6, 3 × 30 min) = ${m} min${t.startTime ? ` (${t.startTime}–${tieFinish(t, t.startTime)})` : ""}`,
    "Wednesday 4: semi-finals (rules need confirmation)",
    "Wednesday 5: finals / conclusion (rules need confirmation)",
  ];
}

/** Natural-language interpretation: confirmed vs needs-confirmation, never a fallback format. */
export function interpretTranscript(text: string) {
  const t = text.toLowerCase();
  const rules: Array<{ rule: string; confirmed: boolean }> = [];
  const has = (re: RegExp) => re.test(t);
  if (has(/diamond/)) rules.push({ rule: "Diamond League structure", confirmed: true });
  const cap = t.match(/(\d{2,3})\s*(players|entries|accepted)/); if (cap) rules.push({ rule: `Capacity ${cap[1]}`, confirmed: true });
  if (has(/pool[- ]?v(s|ersus)?[- ]?pool|same position|1 v 1|tie/)) rules.push({ rule: "Pool-v-pool ties by position", confirmed: true });
  if (has(/1\s*\+\s*2|#1\s*\+\s*#2/)) rules.push({ rule: "Doubles pairs 1+2 / 3+4 / 5+6", confirmed: true });
  if (has(/snake|serpentine/)) rules.push({ rule: "Snake seeding", confirmed: true });
  if (has(/points?/) && !has(/points? (formula|=)\s*\d/)) rules.push({ rule: "Points formula", confirmed: false });
  if (has(/semi/)) rules.push({ rule: "Semi-final rules", confirmed: false });
  if (has(/final/)) rules.push({ rule: "Final rules", confirmed: false });
  return { rules, fallbackUsed: false as const };
}
