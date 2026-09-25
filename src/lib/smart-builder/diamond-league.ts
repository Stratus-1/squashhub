/**
 * Diamond League (Uitsig) — pure engine pieces + reusable template.
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
  return rounds;
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

// ── Open questions (Review "Needs organiser confirmation") ───────────────────
export const DIAMOND_QUESTIONS: OpenQuestion[] = [
  { id: "dl_points", term: "Points formula", question: "What is the exact singles and doubles points formula, and the tie-break inside a pool?", kind: "structural", resolved: false, answer: null },
  { id: "dl_pair_source", term: "Doubles pair source", question: "Are doubles pairs (#1+#2, #3+#4, #5+#6) formed from the original seeded positions, or from each pool re-ranked after the singles?", options: ["Seeded positions", "Re-ranked after singles"], kind: "structural", resolved: false, answer: null },
  { id: "dl_final", term: "Final", question: "How does the final / placement conclusion work after the crossover semi-finals (and what happens to positions 5 and 6)?", kind: "structural", resolved: false, answer: null },
  { id: "dl_overall", term: "Overall pool winner", question: "Do play-off and final points count towards the winning pool's total, and with what weighting?", kind: "structural", resolved: false, answer: null },
  { id: "dl_w45", term: "Wednesdays 4 and 5", question: "Which of Wednesday 28 Oct and 4 Nov is the doubles stage and which is play-offs/final, and how many rounds are played each evening?", options: ["28 Oct doubles, 4 Nov play-offs", "28 Oct play-offs, 4 Nov doubles", "Other"], kind: "structural", resolved: false, answer: null },
];

// ── Template ─────────────────────────────────────────────────────────────────
function stage(name: string, kind: Stage["kind"], discipline: "singles" | "doubles", extra: Partial<Stage> = {}): Stage {
  return {
    id: newId("stage"), name, kind, discipline, groups: 4, groupSize: 6, input: {}, advance: { role: "none" },
    schedule: { mode: "unset" }, ...extra,
  } as Stage;
}

export const DIAMOND_INSTANCE_FIELDS = ["name", "scheduleDefaults", "admission", "divisions.poolNames", "divisions.poolGroups.court", "scoring", "event"];
export const DIAMOND_WEDNESDAYS = weeklyDates("2026-10-07", 5);

/** Builds the Uitsig Diamond League structure into `def` (replacing its divisions). */
export function applyDiamondLeague(def: TournamentDefinition, opts: { courts?: string[][]; startDate?: string | null } = {}) {
  const courts = opts.courts ?? [["Court 1", "Court 2"], ["Court 3", "Court 4"]];
  const dates = opts.startDate === null ? [] : weeklyDates(opts.startDate ?? "2026-10-07", 5);
  def.name = def.name && def.name !== "Untitled tournament" ? def.name : "Diamond League";
  def.category = "open";
  def.quickPath = "custom";
  def.finalStandings = "cumulative";
  def.admission = { capacity: 48, mode: "first_confirmed", waitlist: true };
  def.poolSeeding = { source: "ladder", allocation: "snake", scope: "tournament" };
  def.pairSource = null;
  def.templateMeta = { key: DIAMOND_KEY, name: "Diamond League", instanceFields: DIAMOND_INSTANCE_FIELDS };
  def.scheduleDefaults = { ...(def.scheduleDefaults ?? {}), weekday: 3, startDate: dates[0] ?? null, endDate: dates[4] ?? null } as TournamentDefinition["scheduleDefaults"];
  def.divisions = [0, 1].map((di) => {
    const s1 = stage("Singles cross-pool league", "cross_pool_league", "singles", {
      input: { entrants: 24 }, legs: 1,
      schedule: { mode: dates.length ? "fixed" : "unset", startDate: dates[0] ?? null, endDate: dates[2] ?? null, roundDates: dates.slice(0, 3), weekday: 3 },
    });
    const s2 = stage("Doubles cross-pool league", "cross_pool_league", "doubles", {
      input: { fromStageId: s1.id, arrangement: "same_group" }, groupSize: 3,
      pairing: [[1, 2], [3, 4], [5, 6]],
      progression: { mode: "form_pairs", standings: "carry", pairing: "positions" },
      generation: "owner_approval",
      notes: "Pairs 1+2, 3+4, 5+6 inside each pool. Pair source (seed vs re-ranked singles) needs confirmation.",
      schedule: { mode: "unset" },
    });
    const s3 = stage("Crossover play-offs", "knockout", "singles", {
      groups: 1, groupSize: 16, input: { fromStageId: s2.id },
      qualifierTransition: { positions: [1, 2, 3, 4], method: "cross_pool", poolPairs: [[0, 1], [2, 3]], pairing: "winner_runner_up" },
      qualifierMapping: "cross_pool", generation: "owner_approval",
      progression: { mode: "top_n", top: 4, perPool: true, standings: "carry" },
      notes: "A#1 v B#2, B#1 v A#2, A#3 v B#4, B#3 v A#4 (and C/D). Final mechanics need confirmation.",
      schedule: { mode: "unset" },
    });
    return {
      id: newId("div"), name: `Division ${di + 1}`, eligibility: "open", entry: "individual", leagueUse: null,
      poolNames: ["", "", "", ""],
      poolGroups: [{ pools: [0, 1], court: courts[di][0] }, { pools: [2, 3], court: courts[di][1] }],
      sections: [{ id: newId("sec"), name: "Main", stages: [s1, s2, s3] }],
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
    for (const s of d.sections.flatMap((x) => x.stages)) s.schedule = { mode: "unset" };
  }
  t.questions = t.questions.map((q) => ({ ...q, resolved: false, answer: null }));
  return t;
}

/** Plain chain for the builder map. */
export function diamondChain(def: TournamentDefinition): string[] {
  const src = def.pairSource === "seed" ? "from seeded positions" : def.pairSource === "prior_stage_standings" ? "from each pool re-ranked after singles" : "source needs confirmation";
  return [
    `Registration: first ${def.admission?.capacity ?? "—"} confirmed accepted, rest wait-listed`,
    "Ladder seeding (admin can adjust) → snake into 8 pools",
    "Singles R1 → Singles R2 → Singles R3 (same position v other pools)",
    `Form doubles 1+2 / 3+4 / 5+6 in each pool (${src})`,
    "Doubles cross-pool stage",
    "Crossover play-offs (A1 v B2, B1 v A2, A3 v B4, B3 v A4; C/D mirrored) → final (needs confirmation)",
    "Overall: pool with most points (play-off weighting needs confirmation)",
  ];
}

/** Natural-language interpretation: confirmed vs needs-confirmation, never a fallback format. */
export function interpretTranscript(text: string) {
  const t = text.toLowerCase();
  const rules: Array<{ rule: string; confirmed: boolean }> = [];
  const has = (re: RegExp) => re.test(t);
  if (has(/diamond/)) rules.push({ rule: "Diamond League structure", confirmed: true });
  const cap = t.match(/(\d{2,3})\s*(players|entries|accepted)/); if (cap) rules.push({ rule: `Capacity ${cap[1]}`, confirmed: true });
  if (has(/cross[- ]?pool|same position|#1 in pool a plays/)) rules.push({ rule: "Cross-pool league by position", confirmed: true });
  if (has(/1\s*\+\s*2|#1\s*\+\s*#2/)) rules.push({ rule: "Doubles pairs 1+2 / 3+4 / 5+6", confirmed: true });
  if (has(/snake|serpentine/)) rules.push({ rule: "Snake seeding", confirmed: true });
  if (has(/points?/) && !has(/points? (formula|=)\s*\d/)) rules.push({ rule: "Points formula", confirmed: false });
  if (has(/final/)) rules.push({ rule: "Final mechanics", confirmed: false });
  return { rules, fallbackUsed: false as const };
}
