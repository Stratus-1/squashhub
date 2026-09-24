/**
 * Authoritative tournament engine service (structured architecture).
 *
 * One entry point for GENERATE / PREVIEW PLAYOFFS / CONFIRM PLAYOFFS / EDIT IMPACT.
 * The Beta Builder (create), Structured Editor (edit) and tournament detail (operate)
 * all call these functions against the same persisted spec — no competing generator.
 */
import {
  IntegrityError, assertKnockoutShape, assertStageKinds, bracketOrder, canGenerateStage, contractIssues,
  isDecided, progressionOf, disciplineOf, PAIR_FORMING, nextPow2, roundRobin, snakePools, swissRound,
  type DivisionContract, type FixtureRow, type PlannedStage, type PoolStanding, type SwissTieBreak,
} from "./contract";
import {
  effectiveTransition, planTransition, resolveTransition,
  type QualifierSlot, type SlotPairing, type StageTransition,
} from "./transition";

export interface SpecDivision extends DivisionContract {
  label: string;
  /** Entrant ids in seed order (strongest first). */
  entrants: Array<{ id: string; rank: number | null }>;
  poolLabels?: string[];
}
export interface TournamentSpec {
  version: number;
  architecture: "structured";
  tournamentId?: string;
  name: string;
  scope?: unknown;
  divisions: SpecDivision[];
}

export interface EngineFixture extends FixtureRow {
  tournamentId: string;
  roundId: string;
  poolId: string | null;
  slot?: number;
  /** Real court record ID; must be one of the tournament's selected courts (tournament_venues.court_ids). */
  courtId?: number | null;
}

const poolId = (div: string, stage: string, i: number) => `${div}:${stage}:pool${i + 1}`;

/** Generate every first-stage fixture for a validated spec. Throws on unresolved contract. */
export function generateFromSpec(spec: TournamentSpec, tournamentId: string): EngineFixture[] {
  const out: EngineFixture[] = [];
  for (const d of spec.divisions) {
    const errs = contractIssues(d).filter((i) => i.level === "error");
    if (errs.length) throw new IntegrityError("contract", `${d.label}: ${errs.map((e) => e.message).join("; ")}`);
    const first = [...d.stages].sort((a, b) => a.order - b.order)[0];
    out.push(...generateStage(tournamentId, d, first));
  }
  return out;
}

export function generateStage(tid: string, d: SpecDivision, st: PlannedStage): EngineFixture[] {
  const mk = (f: Omit<EngineFixture, "tournamentId" | "divisionId" | "stageId" | "stageKind">): EngineFixture =>
    ({ tournamentId: tid, divisionId: d.divisionId, stageId: st.id, stageKind: st.kind, ...f });
  if (st.kind === "pools" || st.kind === "round_robin") {
    const n = st.kind === "pools" ? st.pools ?? 1 : 1;
    const { pools, unranked } = snakePools(d.entrants, n);
    unranked.forEach((u, i) => pools[i % n].push(u)); // placed deterministically after ranked, never given a rank
    return pools.flatMap((p, pi) => {
      const once = roundRobin(p.map((x) => x.id));
      const perLeg = Math.max(0, ...once.map((m) => m.round));
      const legs = st.legs === 2 ? [...once, ...once.map((m) => ({ round: m.round + perLeg, a: m.b, b: m.a }))] : once;
      return legs.map((m) => mk({ roundId: `${st.id}:r${m.round}`, round: m.round, poolId: st.kind === "pools" ? poolId(d.divisionId, st.id, pi) : null, a: m.a, b: m.b }));
    });
  }
  if (st.kind === "swiss") return swissFixtures(tid, d, st, 1, d.entrants.map((e, i) => ({ id: e.id, points: 0, seed: i + 1 })), new Set());
  if (st.kind === "knockout") return knockoutFirstRound(tid, d, st, d.entrants.map((e) => e.id));
  throw new IntegrityError("unsupported_first_stage", `${st.kind} cannot be generated as a first stage yet.`);
}

function swissFixtures(tid: string, d: SpecDivision, st: PlannedStage, round: number, players: Array<{ id: string; points: number; seed: number }>, played: Set<string>): EngineFixture[] {
  return swissRound(players, played).map(([a, b], i) => ({
    tournamentId: tid, divisionId: d.divisionId, stageId: st.id, stageKind: "swiss", roundId: `${st.id}:r${round}`, round, poolId: null, slot: i + 1, a, b,
  }));
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
/** A bye (no opponent) counts as a win. */
const swissWinner = (f: FixtureRow) => (f.a && !f.b ? f.a : f.winner ?? null);

/** Swiss standings: wins first, then the stage's tie-breaks in order, then seed. */
export function swissStandings(d: SpecDivision, st: PlannedStage, rows: FixtureRow[]) {
  const mine = rows.filter((f) => f.divisionId === d.divisionId && f.stageId === st.id);
  const pts = new Map(d.entrants.map((e) => [e.id, 0]));
  const opps = new Map(d.entrants.map((e) => [e.id, [] as string[]]));
  const beat = new Map(d.entrants.map((e) => [e.id, [] as string[]]));
  for (const f of mine) {
    const w = swissWinner(f);
    if (w && pts.has(w)) pts.set(w, pts.get(w)! + 1);
    if (f.a && f.b) { opps.get(f.a)?.push(f.b); opps.get(f.b)?.push(f.a); if (w) beat.get(w)?.push(w === f.a ? f.b : f.a); }
  }
  const seed = new Map(d.entrants.map((e, i) => [e.id, i + 1]));
  const tb = (id: string, k: SwissTieBreak) =>
    k === "buchholz" ? (opps.get(id) ?? []).reduce((s, o) => s + (pts.get(o) ?? 0), 0)
      : k === "sonneborn_berger" ? (beat.get(id) ?? []).reduce((s, o) => s + (pts.get(o) ?? 0), 0)
        : -(seed.get(id) ?? 0);
  const order = [...(st.tieBreaks ?? []), "seed" as const];
  const table = d.entrants.map((e) => ({ id: e.id, points: pts.get(e.id) ?? 0, tie: order.map((k) => tb(e.id, k)) }));
  table.sort((x, y) => y.points - x.points || x.tie.reduce((r, _, i) => r || y.tie[i] - x.tie[i], 0));
  return table;
}

/** Next Swiss round from completed results. Refuses to exceed the configured round count. */
export function nextSwissRound(tid: string, d: SpecDivision, stageId: string, rows: FixtureRow[]): EngineFixture[] {
  const st = d.stages.find((s) => s.id === stageId);
  if (!st || st.kind !== "swiss") throw new IntegrityError("stage_kind", "Only Swiss stages pair by results.");
  const mine = rows.filter((f) => f.divisionId === d.divisionId && f.stageId === stageId);
  const last = Math.max(0, ...mine.map((f) => f.round ?? 1));
  if (last >= (st.swissRounds ?? 0)) throw new IntegrityError("swiss_done", `All ${st.swissRounds} Swiss rounds have been created.`);
  if (!mine.filter((f) => (f.round ?? 1) === last).every((f) => swissWinner(f))) throw new IntegrityError("prereq", "Current Swiss round is not finished.");
  const table = swissStandings(d, st, rows);
  const played = new Set(mine.filter((f) => f.a && f.b).map((f) => pairKey(f.a!, f.b!)));
  return swissFixtures(tid, d, st, last + 1, table.map((t, i) => ({ id: t.id, points: t.points, seed: i + 1 })), played);
}

function knockoutFirstRound(tid: string, d: SpecDivision, st: PlannedStage, seeded: Array<string | null>): EngineFixture[] {
  const size = st.drawSize ?? nextPow2(seeded.length);
  const order = bracketOrder(size);
  const at = (seed: number) => seeded[seed - 1] ?? null;
  const rows: EngineFixture[] = [];
  for (let i = 0; i < order.length; i += 2) {
    rows.push({ tournamentId: tid, divisionId: d.divisionId, stageId: st.id, stageKind: "knockout", roundId: `${st.id}:r1`, round: 1, poolId: null, slot: i / 2 + 1, a: at(order[i]), b: at(order[i + 1]) });
  }
  assertKnockoutShape(rows);
  return rows;
}

export interface PreviewPair { slot: number; a: string | null; b: string | null; aSlot: QualifierSlot | null; bSlot: QualifierSlot | null }
export interface PlayoffPreview {
  ok: boolean; reason?: string; stage: PlannedStage;
  /** Resolved pairings (null participants until the source stage is complete). */
  qualifiers: PreviewPair[];
  /** Structure-only mapping, available before any result exists. */
  slots: SlotPairing[];
  transition: StageTransition | null;
  poolLabels?: string[];
  /** true once every slot has resolved to an actual participant. */
  resolved: boolean;
}

/** The source stage a qualifier stage draws from. */
export const sourceStageOf = (d: SpecDivision, stage: PlannedStage) => d.stages.find((s) => s.order === stage.order - 1) ?? null;

/** Structure-only mapping preview: qualifier slots, no results needed. Never writes. */
export function previewTransition(d: SpecDivision, stageId: string): { stage: PlannedStage; source: PlannedStage; transition: StageTransition; slots: SlotPairing[]; poolCount: number } {
  const stage = d.stages.find((s) => s.id === stageId);
  if (!stage) throw new IntegrityError("no_stage", `Stage ${stageId} is not in ${d.label}.`);
  const source = sourceStageOf(d, stage);
  if (!source) throw new IntegrityError("no_source", `${stage.name} has no earlier stage to take qualifiers from.`);
  const transition = effectiveTransition(stage, source);
  const poolCount = source.kind === "pools" ? source.pools ?? 1 : 1;
  return { stage, source, transition, poolCount, slots: planTransition(transition, poolCount) };
}

/** Pure preview of who would qualify and meet whom. Never writes. */
export function previewPlayoffs(d: SpecDivision, stageId: string, standings: PoolStanding[], existing: FixtureRow[]): PlayoffPreview {
  const { stage, transition, slots, poolCount } = previewTransition(d, stageId);
  void poolCount;
  const base = { stage, slots, transition, poolLabels: d.poolLabels, resolved: false };
  const prereq = existing.filter((f) => f.divisionId === d.divisionId && d.stages.find((s) => s.id === f.stageId)!.order < stage.order);
  const gate = canGenerateStage({ stage, prerequisite: prereq, existing: existing.filter((f) => f.divisionId === d.divisionId), ownerConfirmed: true });
  const qualifiers = resolveTransition(slots, standings, d.divisionId)
    .map((p) => ({ slot: p.slot, a: p.aId, b: p.bId, aSlot: p.a, bSlot: p.b }));
  const resolved = qualifiers.every((q) => (!q.aSlot || q.a) && (!q.bSlot || q.b));
  if (!gate.ok) return { ...base, ok: false, reason: (gate as { reason: string }).reason, qualifiers, resolved };
  if (!resolved) return { ...base, ok: false, reason: "Not every qualifying place is filled yet.", qualifiers, resolved };
  return { ...base, ok: true, qualifiers, resolved: true };
}

/** Owner confirmed (or automatic mode): create the knockout stage exactly as previewed. */
export function confirmPlayoffs(tid: string, d: SpecDivision, preview: PlayoffPreview, opts: { ownerConfirmed: boolean; existing: FixtureRow[] }): EngineFixture[] {
  if (!preview.ok) throw new IntegrityError("preview_blocked", preview.reason ?? "Preview not valid.");
  if (preview.stage.generation !== "automatic" && !opts.ownerConfirmed) throw new IntegrityError("needs_confirmation", "Owner must confirm the play-off preview.");
  if (opts.existing.some((f) => f.divisionId === d.divisionId && f.stageId === preview.stage.id))
    throw new IntegrityError("exists", "This play-off stage already exists.");
  const rows: EngineFixture[] = preview.qualifiers.map((q) => ({
    tournamentId: tid, divisionId: d.divisionId, stageId: preview.stage.id, stageKind: preview.stage.kind,
    roundId: `${preview.stage.id}:r1`, round: 1, poolId: null, slot: q.slot, a: q.a, b: q.b,
  }));
  assertStageKinds(d.stages, rows);
  assertKnockoutShape(rows);
  return rows;
}

/* ───────── Edit impact ───────── */

export type ChangeKind = "label" | "schedule" | "structural";
export interface EditImpact {
  kind: "none" | "safe" | "structural";
  changes: Array<{ divisionId: string; kind: ChangeKind; what: string }>;
  blocked: boolean;
  lockedReasons: string[];
  affectedDivisions: string[];
}

const structuralKey = (d: SpecDivision) => JSON.stringify({
  unit: d.unit, seeding: d.seeding, entrants: d.entrants.map((e) => e.id),
  stages: d.stages.map((s) => ({ id: s.id, order: s.order, kind: s.kind, discipline: s.discipline, progression: s.progression, pools: s.pools, poolSize: s.poolSize, drawSize: s.drawSize, swissRounds: s.swissRounds, qualify: s.qualify, legs: s.legs, tieBreaks: s.tieBreaks, thirdPlace: s.thirdPlace })),
});
const scheduleKey = (d: SpecDivision) => JSON.stringify(d.stages.map((s) => [s.id, s.schedule]));

/** Classify an edit. Structural edits over decided fixtures are blocked. */
export function classifyEdit(before: TournamentSpec, after: TournamentSpec, fixtures: FixtureRow[]): EditImpact {
  const changes: EditImpact["changes"] = [];
  const lockedReasons: string[] = [];
  const affected = new Set<string>();
  const bMap = new Map(before.divisions.map((d) => [d.divisionId, d]));
  for (const a of after.divisions) {
    const b = bMap.get(a.divisionId);
    if (!b) { changes.push({ divisionId: a.divisionId, kind: "structural", what: "new division" }); affected.add(a.divisionId); continue; }
    if (a.label !== b.label || JSON.stringify(a.poolLabels ?? []) !== JSON.stringify(b.poolLabels ?? []))
      changes.push({ divisionId: a.divisionId, kind: "label", what: "renamed" });
    if (scheduleKey(a) !== scheduleKey(b)) {
      changes.push({ divisionId: a.divisionId, kind: "schedule", what: "dates/deadlines changed" });
      for (const s of a.stages) {
        const old = b.stages.find((x) => x.id === s.id);
        if (old && JSON.stringify(old.schedule) !== JSON.stringify(s.schedule) &&
          fixtures.some((f) => f.divisionId === a.divisionId && f.stageId === s.id && isDecided(f)) && s.schedule.rule === "fixed")
          lockedReasons.push(`${a.label} · ${s.name}: some games are already played; only unplayed games get the new date.`);
      }
    }
    if (structuralKey(a) !== structuralKey(b)) {
      changes.push({ divisionId: a.divisionId, kind: "structural", what: "format/pools/rounds/qualification/entrants changed" });
      const divFx = fixtures.filter((f) => f.divisionId === a.divisionId);
      const started = new Set(divFx.map((f) => f.stageId));
      const sk = (s: PlannedStage) => JSON.stringify({ ...JSON.parse(structuralKey({ ...a, stages: [s] } as SpecDivision)).stages[0], order: undefined });
      const touched = new Set<string>();
      for (const s of [...a.stages, ...b.stages]) {
        const x = a.stages.find((y) => y.id === s.id), y = b.stages.find((z) => z.id === s.id);
        if (!x || !y || x.order !== y.order || sk(x) !== sk(y)) touched.add(s.id);
      }
      const entrantsChanged = JSON.stringify(a.entrants.map((e) => e.id)) !== JSON.stringify(b.entrants.map((e) => e.id)) || a.unit !== b.unit || JSON.stringify(a.seeding) !== JSON.stringify(b.seeding);
      const lockedStages = [...touched].filter((id) => started.has(id));
      const futureOnly = !entrantsChanged && started.size > 0 && lockedStages.length === 0;
      if (!futureOnly) affected.add(a.divisionId);
      const decided = divFx.filter(isDecided);
      if (lockedStages.length) lockedReasons.push(`${a.label}: stage(s) with games already created can't be moved, removed or reconfigured. Structure is locked.`);
      else if (!futureOnly && decided.length) lockedReasons.push(`${a.label}: ${decided.length} completed game(s) would be invalidated. Structure is locked.`);
    }
  }
  for (const b of before.divisions) if (!after.divisions.some((a) => a.divisionId === b.divisionId)) {
    changes.push({ divisionId: b.divisionId, kind: "structural", what: "division removed" }); affected.add(b.divisionId);
    if (fixtures.some((f) => f.divisionId === b.divisionId && isDecided(f))) lockedReasons.push(`${b.label}: has results and cannot be removed.`);
  }
  const structural = changes.some((c) => c.kind === "structural");
  const blocked = structural && lockedReasons.some((r) => r.includes("locked") || r.includes("cannot be removed"));
  return { kind: changes.length === 0 ? "none" : structural ? "structural" : "safe", changes, blocked, lockedReasons, affectedDivisions: [...affected] };
}

/** Targeted regeneration: only affected, fully-unplayed divisions are rebuilt; everything else is kept verbatim. */
export function applyEdit(after: TournamentSpec, impact: EditImpact, fixtures: EngineFixture[], tid: string) {
  if (impact.blocked) throw new IntegrityError("locked", impact.lockedReasons.join(" "));
  const keep = fixtures.filter((f) => !impact.affectedDivisions.includes(f.divisionId));
  const removeIds = fixtures.filter((f) => impact.affectedDivisions.includes(f.divisionId)).map((f) => f.id!).filter(Boolean);
  const create = generateFromSpec({ ...after, divisions: after.divisions.filter((d) => impact.affectedDivisions.includes(d.divisionId)) }, tid);
  return { keep, removeIds, create };
}

/** Round-trip helpers so the editor reopens exactly what was saved. */
export const serializeSpec = (s: TournamentSpec) => JSON.parse(JSON.stringify(s)) as TournamentSpec;
export const isStructured = (t: { builder_architecture?: string | null }) => t.builder_architecture === "structured";

/* ───────── Multi-stage progression (same engine, no second generator) ───────── */

const unitPlayers = (u: string) => u.split("+");

/** Stage table: wins per unit in one stage, ties broken by the given seed order. */
export function stageTable(stageId: string, rows: FixtureRow[], seedOrder: string[]): Array<{ id: string; wins: number }> {
  const t = new Map<string, number>();
  for (const f of rows.filter((x) => x.stageId === stageId)) {
    for (const u of [f.a, f.b]) if (u && !t.has(u)) t.set(u, 0);
    const w = f.a && !f.b ? f.a : f.winner;
    if (w) t.set(w, (t.get(w) ?? 0) + 1);
  }
  const seed = (id: string) => { const i = seedOrder.indexOf(id); return i < 0 ? 1e9 : i; };
  return [...t.entries()].map(([id, wins]) => ({ id, wins })).sort((x, y) => y.wins - x.wins || seed(x.id) - seed(y.id));
}

/** Per-player points across the given stages; a pair's win counts for both partners. */
export function playerPoints(stageIds: string[], rows: FixtureRow[]): Map<string, number> {
  const pts = new Map<string, number>();
  for (const f of rows.filter((x) => stageIds.includes(x.stageId))) {
    for (const u of [f.a, f.b]) if (u) for (const p of unitPlayers(u)) if (!pts.has(p)) pts.set(p, 0);
    const w = f.a && !f.b ? f.a : f.winner;
    if (w) for (const p of unitPlayers(w)) pts.set(p, (pts.get(p) ?? 0) + 1);
  }
  return pts;
}

/** Form doubles pairs from a ranked list of players. */
export function formPairs(ranked: string[], method: "fold" | "positions" | "manual", manual?: string[][]): string[] {
  if (method === "manual") {
    if (!manual?.length) throw new IntegrityError("pairs_missing", "Set the pairs before starting this stage.");
    const used = manual.flat();
    if (new Set(used).size !== used.length || manual.some((p) => p.length !== 2)) throw new IntegrityError("pairs_invalid", "Each player must be in exactly one pair of two.");
    const missing = ranked.filter((r) => !used.includes(r));
    const extra = used.filter((u) => !ranked.includes(u));
    if (missing.length || extra.length) throw new IntegrityError("pairs_invalid", "The pairs must use exactly the players from the previous stage.");
    return manual.map((p) => p.join("+"));
  }
  if (ranked.length % 2) throw new IntegrityError("odd_pairs", `${ranked.length} players can't all be paired.`);
  const out: string[] = [];
  if (method === "positions") for (let i = 0; i < ranked.length; i += 2) out.push(`${ranked[i]}+${ranked[i + 1]}`);
  else for (let i = 0; i < ranked.length / 2; i++) out.push(`${ranked[i]}+${ranked[ranked.length - 1 - i]}`);
  return out;
}

const stageFinished = (st: PlannedStage, rows: FixtureRow[]) => {
  const r = rows.filter((f) => f.stageId === st.id);
  if (!r.length || !r.every((f) => isDecided(f) || !f.a || !f.b)) return false;
  if (st.kind === "swiss") return Math.max(...r.map((f) => f.round ?? 1)) >= (st.swissRounds ?? 1);
  return true;
};

export interface NextStagePlan { stage: PlannedStage; entrants: Array<{ id: string; rank: number }>; fixtures: EngineFixture[] }

/**
 * Next non-qualifier stage (everyone continues / form pairs). Qualifier stages use the play-off path.
 * Seeds the new stage from the previous stage (or cumulative points when carrying forward).
 */
export function nextStageFixtures(tid: string, d: SpecDivision, stageId: string, rows: FixtureRow[], opts: { ownerConfirmed: boolean; pairs?: string[][] }): NextStagePlan {
  const stage = d.stages.find((s) => s.id === stageId);
  if (!stage || stage.order === 0) throw new IntegrityError("no_stage", "Unknown later stage.");
  const p = progressionOf(stage);
  if (p.mode === "qualifiers") throw new IntegrityError("use_playoffs", "This stage takes qualifiers — use the play-off preview.");
  const errs = contractIssues(d).filter((i) => i.level === "error" && i.stageId === stage.id);
  if (errs.length) throw new IntegrityError("contract", errs.map((e) => e.message).join("; "));
  const div = rows.filter((f) => f.divisionId === d.divisionId);
  if (div.some((f) => f.stageId === stage.id)) throw new IntegrityError("exists", `${stage.name} already has games.`);
  const prev = d.stages.find((s) => s.order === stage.order - 1)!;
  if (!stageFinished(prev, div)) throw new IntegrityError("prereq", `${prev.name} is not finished.`);
  if (stage.generation !== "automatic" && !opts.ownerConfirmed) throw new IntegrityError("needs_confirmation", "Owner must confirm before the next stage is created.");
  const seedOrder = d.entrants.map((e) => e.id);
  const earlier = d.stages.filter((s) => s.order < stage.order).map((s) => s.id);
  // 1. Rank the previous stage (optionally by points carried across earlier stages).
  const prevTable = stageTable(prev.id, div, seedOrder).map((x) => x.id);
  let ranked = prevTable;
  if (p.standings === "carry") {
    const pts = playerPoints(earlier, div);
    const score = (u: string) => unitPlayers(u).reduce((n, x) => n + (pts.get(x) ?? 0), 0);
    ranked = [...prevTable].sort((x, y) => score(y) - score(x) || prevTable.indexOf(x) - prevTable.indexOf(y));
  }
  // 2. Who continues.
  if (p.mode === "top_n") {
    if (!p.top || p.top > ranked.length) throw new IntegrityError("top_n", `Only ${ranked.length} can continue from ${prev.name}.`);
    ranked = ranked.slice(0, p.top);
  }
  // 3. Participant shape for THIS stage's own discipline — never implicit.
  const dPrev = disciplineOf(d, prev), dCur = disciplineOf(d, stage);
  let units: string[];
  if (dPrev === "singles" && dCur === "doubles") {
    if (!p.pairing || !PAIR_FORMING.includes(p.pairing)) throw new IntegrityError("pairs_model", "Choose how pairs are formed before starting this stage.");
    units = formPairs(ranked, p.pairing as "fold" | "positions" | "manual", opts.pairs);
  } else if (dPrev === "doubles" && dCur === "singles") {
    if (p.pairing !== "split") throw new IntegrityError("split_model", "Choose how pairs become singles players before starting this stage.");
    units = ranked.flatMap(unitPlayers);
  } else units = ranked;
  const entrants = units.map((id, i) => ({ id, rank: i + 1 }));
  const fixtures = generateStage(tid, { ...d, entrants }, stage);
  assertStageKinds(d.stages, fixtures);
  return { stage, entrants, fixtures };
}

/** Final standings per player: last stage only, or points added up across every stage. */
export function finalStandings(d: SpecDivision, rows: FixtureRow[]): Array<{ id: string; points: number; position: number }> {
  const div = rows.filter((f) => f.divisionId === d.divisionId);
  const ordered = [...d.stages].sort((a, b) => a.order - b.order);
  const ids = d.finalStandings === "cumulative" ? ordered.map((s) => s.id) : [ordered[ordered.length - 1].id];
  const pts = playerPoints(ids, div);
  const seed = d.entrants.flatMap((e) => unitPlayers(e.id));
  return [...pts.entries()].sort((x, y) => y[1] - x[1] || seed.indexOf(x[0]) - seed.indexOf(y[0])).map(([id, points], i) => ({ id, points, position: i + 1 }));
}
