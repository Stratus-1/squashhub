/**
 * Authoritative tournament engine service (structured architecture).
 *
 * One entry point for GENERATE / PREVIEW PLAYOFFS / CONFIRM PLAYOFFS / EDIT IMPACT.
 * The Beta Builder (create), Structured Editor (edit) and tournament detail (operate)
 * all call these functions against the same persisted spec — no competing generator.
 */
import {
  IntegrityError, assertKnockoutShape, assertStageKinds, bracketOrder, canGenerateStage, contractIssues,
  isDecided, mapQualifiers, nextPow2, roundRobin, snakePools, swissRound,
  type DivisionContract, type FixtureRow, type PlannedStage, type PoolStanding, type SwissTieBreak,
} from "./contract";

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

function generateStage(tid: string, d: SpecDivision, st: PlannedStage): EngineFixture[] {
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

export interface PlayoffPreview { ok: boolean; reason?: string; qualifiers: Array<{ slot: number; a: string | null; b: string | null }>; stage: PlannedStage }

/** Pure preview of who would qualify and meet whom. Never writes. */
export function previewPlayoffs(d: SpecDivision, stageId: string, standings: PoolStanding[], existing: FixtureRow[]): PlayoffPreview {
  const stage = d.stages.find((s) => s.id === stageId);
  if (!stage) throw new IntegrityError("no_stage", `Stage ${stageId} is not in ${d.label}.`);
  const prereq = existing.filter((f) => f.divisionId === d.divisionId && d.stages.find((s) => s.id === f.stageId)!.order < stage.order);
  const gate = canGenerateStage({ stage, prerequisite: prereq, existing: existing.filter((f) => f.divisionId === d.divisionId), ownerConfirmed: true });
  if (!gate.ok) return { ok: false, reason: (gate as { reason: string }).reason, qualifiers: [], stage };
  const qualifiers = mapQualifiers(standings, { divisionId: d.divisionId, perPool: stage.qualify!.perPool, mapping: stage.qualify!.mapping! });
  return { ok: true, qualifiers, stage };
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
  stages: d.stages.map((s) => ({ id: s.id, order: s.order, kind: s.kind, pools: s.pools, poolSize: s.poolSize, drawSize: s.drawSize, swissRounds: s.swissRounds, qualify: s.qualify, legs: s.legs, tieBreaks: s.tieBreaks, thirdPlace: s.thirdPlace })),
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
      affected.add(a.divisionId);
      const decided = fixtures.filter((f) => f.divisionId === a.divisionId && isDecided(f));
      if (decided.length) lockedReasons.push(`${a.label}: ${decided.length} completed game(s) would be invalidated. Structure is locked.`);
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
