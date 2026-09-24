/**
 * Tournament Engine — Contract, Stage Plan and Integrity Guards.
 *
 * Deterministic, pure functions. No AI, no database. This is the layer the
 * Smart Builder must satisfy before anything is generated, and the layer that
 * fixture generation/rebuild paths consult to refuse structural mistakes.
 *
 * Rules (see docs/TOURNAMENT_ENGINE_INTEGRITY.md):
 *  - A stage's kind is fixed once planned. Knockout never becomes round robin.
 *  - Playoffs need an explicit qualification + mapping rule.
 *  - Round counts come from configuration, never from the roster size.
 *  - Rebuilds read CURRENT active entrants and never touch completed results.
 *  - Divisions are isolated; pairs are units and are never split.
 */

export type StageKind = "round_robin" | "pools" | "knockout" | "swiss" | "placement";
export type ScheduleRule = "fixed" | "play_by" | "window";
export type GenerationMode = "automatic" | "owner_approval";
export type QualifierMapping = "cross_pool" | "reseed" | "same_pool";

export type SwissTieBreak = "buchholz" | "sonneborn_berger" | "seed";

/** How entrants move from the previous stage into this one. Stage 1 always takes the entries. */
/**
 * WHO continues (mode) is separate from HOW participants change shape (pairing) and from points (standings).
 * - all_continue: everyone from the previous stage
 * - top_n: the top `top` of the previous stage's table (any destination format)
 * - qualifiers: pool/position qualifiers into a play-off via the mapping/transition path
 * - form_pairs: legacy = all_continue + pairing (older drafts)
 */
export type ProgressionMode = "qualifiers" | "all_continue" | "top_n" | "form_pairs";
export type PairingRule = "fold" | "positions" | "manual" | "split";
export interface Progression {
  mode: ProgressionMode;
  /** whether earlier points count in this stage's table. */
  standings?: "carry" | "reset" | null;
  /** Required when the discipline changes. Singles→doubles: fold = 1st+last, positions = 1+2, 3+4, manual = owner sets pairs.
   *  Doubles→singles: split = each pair's players continue individually at the pair's position. */
  pairing?: PairingRule | null;
  /** top_n: how many continue (players or units of the previous stage). */
  top?: number | null;
}
export const PAIR_FORMING: PairingRule[] = ["fold", "positions", "manual"];

export interface PlannedStage {
  id: string;
  order: number;
  kind: StageKind;
  name: string;
  /** pools / round robin */
  pools?: number;
  poolSize?: number;
  /** swiss */
  swissRounds?: number;
  /** swiss tie-breaks, applied in order after wins */
  tieBreaks?: SwissTieBreak[];
  /** round robin: 1 = play once, 2 = home and away */
  legs?: 1 | 2;
  /** knockout: also play a 3rd/4th place match between the losing semi-finalists */
  thirdPlace?: boolean;
  /** singles / doubles for this stage (default = division unit) */
  discipline?: "singles" | "doubles";
  /** later stages: explicit progression rule (default for knockout = qualifiers) */
  progression?: Progression | null;
  /** knockout draw size */
  drawSize?: number;
  /** start/end = explicit stage window (NULL = inherit tournament window); date/deadline/roundDates = round schedule. */
  schedule: { rule: ScheduleRule | null; date?: string | null; deadline?: string | null; start?: string | null; end?: string | null; roundDates?: string[] };
  /** playoff stages only. `transition` is the explicit, stable-id progression rule; `mapping` stays in step for older readers. */
  qualify?: { perPool: number; mapping: QualifierMapping | null; transition?: import("./transition").StageTransition | null } | null;
  generation?: GenerationMode;
}

export interface DivisionContract {
  divisionId: string;
  unit: "players" | "pairs";
  expectedEntrants: number | null;
  seeding: { source: string | null; method: "snake" | "banded" | "random" | null };
  stages: PlannedStage[];
  placements: "champion" | "all_positions";
  /** Final table: last stage only, or points added up across stages. */
  finalStandings?: "last_stage" | "cumulative";
}

export const progressionOf = (s: PlannedStage): Progression =>
  s.progression ?? { mode: s.kind === "knockout" || s.kind === "placement" ? "qualifiers" : "all_continue", standings: null };
export const disciplineOf = (c: DivisionContract, s: PlannedStage) => s.discipline ?? (c.unit === "pairs" ? "doubles" : "singles");

export interface ContractIssue { level: "error" | "warning"; code: string; message: string; stageId?: string }

const log2 = (n: number) => Math.log2(n);
const isPow2 = (n: number) => n > 0 && Number.isInteger(log2(n));

/** Mandatory structural information. Any error = do NOT generate fixtures. */
export function contractIssues(c: DivisionContract): ContractIssue[] {
  const out: ContractIssue[] = [];
  const e = (code: string, message: string, stageId?: string) => out.push({ level: "error", code, message, stageId });
  if (!c.expectedEntrants || c.expectedEntrants < 2) e("entrants", "Expected number of players/teams is not set.");
  if (!c.seeding.source) out.push({ level: "warning", code: "seeding", message: "No seeding source chosen — pools would be random." });
  if (!c.stages.length) e("no_stages", "No stages planned.");
  c.stages.forEach((s, i) => {
    if (!s.schedule.rule) e("schedule_rule", `${s.name}: choose Fixed date, Play-by date or Window.`, s.id);
    if (s.schedule.rule === "fixed" && !s.schedule.date) e("schedule_fixed", `${s.name}: fixed rule needs a date.`, s.id);
    if (s.schedule.rule === "play_by" && !s.schedule.deadline) e("schedule_playby", `${s.name}: play-by rule needs a deadline.`, s.id);
    if (s.schedule.rule === "window" && (!s.schedule.start || !s.schedule.end)) e("schedule_window", `${s.name}: window needs a start and end.`, s.id);
    if (s.kind === "pools" && (!s.pools || !s.poolSize)) e("pools", `${s.name}: pool count and pool size are required.`, s.id);
    if (s.kind === "swiss" && !s.swissRounds) e("swiss_rounds", `${s.name}: the number of Swiss rounds must be set.`, s.id);
    if (i === 0) {
      if (disciplineOf(c, s) === "doubles" && c.unit !== "pairs") e("first_doubles", `${s.name}: a first-stage doubles event needs pair entries (set the division to doubles).`, s.id);
      return;
    }
    const prev = c.stages[i - 1];
    const p = progressionOf(s);
    const dPrev = disciplineOf(c, prev), dCur = disciplineOf(c, s);
    if (!s.generation) e("playoff_generation", `${s.name}: choose automatic or owner-approved generation.`, s.id);
    const toPairs = dPrev === "singles" && dCur === "doubles", toSingles = dPrev === "doubles" && dCur === "singles";
    if (toPairs && !(p.pairing && PAIR_FORMING.includes(p.pairing)))
      e(p.pairing ? "pairing" : "pairs_model", `${s.name}: singles players can't become doubles pairs without a pairing rule — choose how pairs are formed.`, s.id);
    if (toSingles && p.pairing !== "split")
      e("split_model", `${s.name}: doubles pairs can't become singles players without a rule — choose "each pair's players continue individually".`, s.id);
    if (!toPairs && !toSingles && p.pairing) e("pairing_scope", `${s.name}: a pairing rule only applies when the match type changes.`, s.id);
    if (toPairs && p.mode === "qualifiers") e("pairs_qualifiers", `${s.name}: to form pairs from qualifiers, use "Top N continue".`, s.id);
    if (p.mode === "form_pairs" && !toPairs) e("form_pairs_scope", `${s.name}: forming pairs only applies from a singles stage to a doubles stage.`, s.id);
    if (p.mode !== "qualifiers" && !p.standings) e("standings_rule", `${s.name}: choose whether points carry forward or reset.`, s.id);
    if (toPairs && (p.mode === "all_continue" || p.mode === "form_pairs") && c.expectedEntrants && c.expectedEntrants % 2 === 1 && i === 1)
      e("odd_pairs", `${s.name}: ${c.expectedEntrants} players can't all be paired — an even number is needed.`, s.id);
    if (p.mode === "top_n") {
      if (!p.top || p.top < 2) e("top_n", `${s.name}: choose how many continue (at least 2).`, s.id);
      else if (toPairs && p.top % 2) e("odd_pairs", `${s.name}: ${p.top} players can't all be paired — choose an even number.`, s.id);
    }
    if (p.mode === "qualifiers") {
      if (!s.qualify || !s.qualify.perPool) e("playoff_qualify", `${s.name}: who qualifies is not defined.`, s.id);
      else if (s.kind === "knockout" && !s.qualify.mapping && !s.qualify.transition) e("playoff_mapping", `${s.name}: how qualifiers are mapped/seeded is not defined.`, s.id);
      if (s.kind !== "knockout" && s.kind !== "placement") e("qualifier_target", `${s.name}: qualifiers currently feed a knockout only.`, s.id);
      if (s.qualify?.perPool && prev.pools) {
        const q = s.qualify.perPool * prev.pools;
        if (s.kind === "knockout" && s.drawSize && q > s.drawSize) e("draw_too_small", `${s.name}: ${q} qualifiers but a draw of ${s.drawSize}.`, s.id);
        if (s.kind === "knockout" && !isPow2(q)) out.push({ level: "warning", code: "byes", message: `${s.name}: ${q} qualifiers → ${nextPow2(q) - q} byes.`, stageId: s.id });
      }
    }
    if (prev.kind === "knockout" && p.mode !== "qualifiers") e("after_knockout", `${s.name}: a knockout eliminates players, so a later stage can't continue with everyone.`, s.id);
  });
  const dates = c.stages.map((s) => s.schedule.date || s.schedule.deadline || s.schedule.end).filter(Boolean) as string[];
  for (let i = 1; i < dates.length; i++) if (dates[i] < dates[i - 1]) e("date_order", "A later stage is dated before an earlier stage.");
  return out;
}

export const nextPow2 = (n: number) => { let p = 1; while (p < n) p *= 2; return p; };
const rr = (n: number) => (n * (n - 1)) / 2;

/** Concrete counts for the pre-generation Tournament Map. */
export function tournamentMap(c: DivisionContract) {
  const lines: string[] = [];
  let total = 0, entrants = c.expectedEntrants ?? 0;
  lines.push(`${entrants} ${c.unit}`);
  for (const s of c.stages) {
    if (s.kind === "pools" || s.kind === "round_robin") {
      const pools = s.kind === "pools" ? s.pools ?? 1 : 1;
      const size = s.kind === "pools" ? s.poolSize ?? 0 : entrants;
      const m = pools * rr(size) * (s.legs ?? 1);
      total += m;
      lines.push(`${pools} pool${pools === 1 ? "" : "s"} x ${size}`, `${Math.max(0, size - 1)} pool matches per entrant`, `${m} pool matches`);
      entrants = s.kind === "pools" ? pools * size : entrants;
    } else if (s.kind === "swiss") {
      const m = (s.swissRounds ?? 0) * Math.floor(entrants / 2);
      total += m;
      lines.push(`Swiss: ${s.swissRounds} rounds, ${m} matches`);
    } else {
      const prev = c.stages[s.order - 1];
      const q = s.qualify?.perPool && prev?.pools ? s.qualify.perPool * prev.pools : s.drawSize ?? entrants;
      const draw = nextPow2(q);
      const rounds = knockoutRoundNames(draw);
      const m = c.placements === "all_positions" ? (draw / 2) * log2(draw) : q - 1;
      total += m;
      lines.push(`Top ${s.qualify?.perPool ?? "?"} qualify (${q})`, rounds.join(" -> "), `${m} playoff matches`);
      entrants = q;
    }
  }
  lines.push(`${total} total matches`);
  return { lines, totalMatches: total };
}

export function knockoutRoundNames(draw: number): string[] {
  const names: string[] = [];
  for (let n = draw; n >= 2; n /= 2) names.push(n === 2 ? "Final" : n === 4 ? "SF" : n === 8 ? "QF" : `R${n}`);
  return names;
}

/* --------------------------------------------------------------- Seeding */

export interface Seeded { id: string; rank: number | null }

/** Balanced snake distribution. Unranked entrants are never given invented values — they're returned for manual placement. */
export function snakePools<T extends Seeded>(entrants: T[], pools: number): { pools: T[][]; unranked: T[] } {
  const ranked = entrants.filter((e) => e.rank != null).sort((a, b) => (a.rank! - b.rank!) || a.id.localeCompare(b.id));
  const unranked = entrants.filter((e) => e.rank == null);
  const out: T[][] = Array.from({ length: pools }, () => []);
  ranked.forEach((e, i) => {
    const row = Math.floor(i / pools), col = i % pools;
    out[row % 2 === 0 ? col : pools - 1 - col].push(e);
  });
  return { pools: out, unranked };
}

/* ------------------------------------------------------- Round robin */

/** Circle-method round robin: every pair meets exactly once. */
export function roundRobin(ids: string[]): Array<{ round: number; a: string; b: string }> {
  const list = ids.length % 2 ? [...ids, "__BYE__"] : [...ids];
  const n = list.length, out: Array<{ round: number; a: string; b: string }> = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      if (a !== "__BYE__" && b !== "__BYE__") out.push({ round: r + 1, a, b });
    }
    list.splice(1, 0, list.pop()!);
  }
  return out;
}

/* ------------------------------------------------ Qualifiers → knockout */

export interface PoolStanding { pool: number; position: number; id: string; divisionId: string }

/**
 * Deterministic cross-pool mapping. Pool winners are seeded 1..P, runners-up
 * next, etc. Standard bracket placement keeps same-pool entrants apart until
 * as late as possible. Only entrants of `divisionId` are accepted.
 */
export function mapQualifiers(
  standings: PoolStanding[],
  opts: { divisionId: string; perPool: number; mapping: QualifierMapping | null },
): Array<{ slot: number; a: string | null; b: string | null }> {
  if (!opts.mapping) throw new IntegrityError("playoff_mapping", "Playoffs need an explicit qualification/mapping rule.");
  const own = standings.filter((s) => s.divisionId === opts.divisionId);
  if (own.length !== standings.length) throw new IntegrityError("division_mix", "Standings from another division were supplied.");
  const q = own.filter((s) => s.position <= opts.perPool);
  const seeds = [...q].sort((a, b) => a.position - b.position || a.pool - b.pool).map((s) => s.id);
  const draw = nextPow2(seeds.length);
  const order = bracketOrder(draw);
  const slotted = order.map((seed) => seeds[seed - 1] ?? null);
  const out: Array<{ slot: number; a: string | null; b: string | null }> = [];
  for (let i = 0; i < draw; i += 2) out.push({ slot: i / 2 + 1, a: slotted[i], b: slotted[i + 1] });
  return out;
}

/** Standard seeded bracket order, e.g. 8 → [1,8,4,5,2,7,3,6]. */
export function bracketOrder(n: number): number[] {
  let o = [1];
  while (o.length < n) { const m = o.length * 2 + 1; o = o.flatMap((s) => [s, m - s]); }
  return o;
}

/* --------------------------------------------------------------- Swiss */

/** One Swiss round: pair within score groups, avoid repeat opponents; never alters round count. */
export function swissRound(
  players: Array<{ id: string; points: number; seed: number }>,
  played: Set<string>,
): Array<[string, string | null]> {
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const sorted = [...players].sort((a, b) => b.points - a.points || a.seed - b.seed);
  const solve = (rest: typeof sorted): Array<[string, string | null]> | null => {
    if (!rest.length) return [];
    const [p, ...others] = rest;
    if (!others.length) return [[p.id, null]];
    for (let i = 0; i < others.length; i++) {
      if (played.has(key(p.id, others[i].id))) continue;
      const tail = solve(others.filter((_, j) => j !== i));
      if (tail) return [[p.id, others[i].id], ...tail];
    }
    return null;
  };
  const r = solve(sorted);
  if (!r) throw new IntegrityError("swiss_repeat", "No pairing without repeat opponents exists for this round.");
  return r;
}

/* -------------------------------------------------------------- Guards */

export class IntegrityError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "IntegrityError"; }
}

export interface FixtureRow {
  id?: string;
  divisionId: string;
  stageId: string;
  stageKind: StageKind;
  round?: number | null;
  a: string | null;
  b: string | null;
  status?: string | null;
  score?: string | null;
  winner?: string | null;
  date?: string | null;
  court?: number | null;
  /** 3rd/4th place match — losers play it, so it never counts as re-entry. */
  thirdPlace?: boolean;
  venue?: string | null;
}

const DONE = new Set(["completed", "complete", "walkover", "forfeit", "forfeited"]);
export const isDecided = (f: FixtureRow) => DONE.has(String(f.status ?? "")) || !!f.winner || !!f.score;

/** A planned stage's kind is immutable: every fixture must carry its stage's planned kind. */
export function assertStageKinds(plan: PlannedStage[], fixtures: FixtureRow[]) {
  const kind = new Map(plan.map((s) => [s.id, s.kind]));
  for (const f of fixtures) {
    const k = kind.get(f.stageId);
    if (!k) throw new IntegrityError("unknown_stage", `Fixture for unplanned stage ${f.stageId}.`);
    const ok = k === f.stageKind || (k === "pools" && f.stageKind === "round_robin");
    if (!ok) throw new IntegrityError("stage_kind_changed", `Stage ${f.stageId} is ${k} and cannot produce ${f.stageKind} fixtures.`);
  }
}

/** Knockout stages never contain round-robin shaped fixtures (an entrant appearing twice in the same round). */
export function assertKnockoutShape(fixtures: FixtureRow[]) {
  const seen = new Map<string, Set<string>>();
  for (const f of fixtures) {
    if (f.stageKind !== "knockout" && f.stageKind !== "placement") continue;
    const k = `${f.stageId}|${f.round ?? 0}`;
    const s = seen.get(k) ?? new Set<string>();
    for (const id of [f.a, f.b]) {
      if (!id) continue;
      if (s.has(id)) throw new IntegrityError("knockout_as_rr", `Entrant ${id} appears twice in one knockout round.`);
      s.add(id);
    }
    seen.set(k, s);
  }
}

/** May the next stage be generated right now? */
export function canGenerateStage(opts: {
  stage: PlannedStage;
  prerequisite: FixtureRow[];
  existing: FixtureRow[];
  ownerConfirmed?: boolean;
  allowPlaceholders?: boolean;
}): { ok: true } | { ok: false; code: string; reason: string } {
  const { stage } = opts;
  if (opts.existing.some((f) => f.stageId === stage.id)) return { ok: false, code: "exists", reason: `${stage.name} already exists.` };
  if ((stage.kind === "knockout" || stage.kind === "placement") && !stage.qualify?.mapping && !stage.qualify?.transition)
    return { ok: false, code: "no_mapping", reason: "No qualification/mapping rule." };
  const pending = opts.prerequisite.filter((f) => f.a && f.b && !isDecided(f)).length;
  if (pending > 0 && !opts.allowPlaceholders) return { ok: false, code: "prereq", reason: `${pending} prerequisite result(s) outstanding.` };
  if (stage.generation !== "automatic" && !opts.ownerConfirmed) return { ok: false, code: "needs_confirmation", reason: "Owner must preview and confirm." };
  return { ok: true };
}

/**
 * Rebuild plan: current active entrants + configured round count. Decided
 * fixtures are kept byte-for-byte; only undecided fixtures between active
 * entrants of THIS division are regenerated.
 */
export function planRebuild(opts: {
  divisionId: string;
  configuredRounds: number | null;
  activeEntrantIds: string[];
  existing: FixtureRow[];
  generate: (ids: string[], rounds: number | null) => FixtureRow[];
}) {
  const own = opts.existing.filter((f) => f.divisionId === opts.divisionId);
  const keep = own.filter(isDecided);
  const active = new Set(opts.activeEntrantIds);
  const playedPairs = new Set(keep.map((f) => [f.a, f.b].sort().join("|")));
  const fresh = opts
    .generate(opts.activeEntrantIds, opts.configuredRounds)
    .filter((f) => active.has(f.a ?? "") && active.has(f.b ?? ""))
    .filter((f) => !playedPairs.has([f.a, f.b].sort().join("|")))
    .map((f) => ({ ...f, divisionId: opts.divisionId }));
  return { keep, create: fresh, removeIds: own.filter((f) => !isDecided(f)).map((f) => f.id) };
}

/** Seeds are frozen once fixtures are published. */
export function assertSeedsUnchanged(published: boolean, before: Record<string, number>, after: Record<string, number>) {
  if (!published) return;
  for (const k of Object.keys(before)) if (before[k] !== after[k]) throw new IntegrityError("seed_changed", `Seed for ${k} changed after publication.`);
}

/** Eliminated entrants never reappear in a later knockout round. */
export function assertNoReentry(fixtures: FixtureRow[]) {
  const out = new Set<string>();
  const byRound = [...fixtures].filter((f) => f.stageKind === "knockout" && !f.thirdPlace).sort((x, y) => (x.round ?? 0) - (y.round ?? 0));
  for (const f of byRound) {
    for (const id of [f.a, f.b]) if (id && out.has(id)) throw new IntegrityError("reentry", `Eliminated entrant ${id} reintroduced.`);
    if (f.winner) for (const id of [f.a, f.b]) if (id && id !== f.winner) out.add(id);
  }
}

/** Every fixture respects configured dates, courts and venues. */
export function assertScheduleWithin(
  fixtures: FixtureRow[],
  c: { start?: string | null; end?: string | null; courts?: number | null; venues?: string[] },
) {
  const used = new Set<string>();
  for (const f of fixtures) {
    if (!f.date) continue;
    const d = f.date.slice(0, 10);
    if (c.start && d < c.start) throw new IntegrityError("before_start", `Fixture on ${d} before ${c.start}.`);
    if (c.end && d > c.end) throw new IntegrityError("after_end", `Fixture on ${d} after ${c.end}.`);
    if (c.courts && f.court != null && (f.court < 1 || f.court > c.courts)) throw new IntegrityError("court", `Court ${f.court} does not exist.`);
    if (c.venues?.length && f.venue && !c.venues.includes(f.venue)) throw new IntegrityError("venue", `Venue ${f.venue} is not configured.`);
    const slot = `${f.date}|${f.venue ?? ""}|${f.court ?? ""}`;
    if (f.court != null) { if (used.has(slot)) throw new IntegrityError("double_booked", `Court clash at ${slot}.`); used.add(slot); }
  }
}
