/**
 * Stage progression engine for structured (Beta) tournaments.
 *
 * One lifecycle per stage, derived from the saved spec + the games actually stored:
 *   waiting      — defined; the stage it depends on is not finished yet
 *   ready        — defined; its source is finished and it resolves cleanly → starts AUTOMATICALLY
 *   blocked      — defined; its source is finished but it can't be resolved safely (tie, bad mapping,
 *                  missing result, too few qualifiers…) → held, with the exact reason, nothing written
 *   active       — has games, not all decided
 *   completed    — every game decided (knockouts: final played; Swiss: all rounds played)
 *   deferred     — "Define later", the stage before it is not finished yet
 *   needs_setup  — "Define later", the stage before it IS finished → admin must "Set up next stage"
 *
 * Automatic progression only ever starts `ready` stages, through the SAME engine functions an admin
 * would use, inside one all-or-nothing commit. It is idempotent: a stage with games is never started
 * again, and the database refuses a second copy of a stage round (see guard_structured_stage_round_once).
 */
import { IntegrityError, contractIssues, isDecided, progressionOf, sourcePoolCount, type PlannedStage } from "./contract";
import { mappingIssues } from "./mapping";
import { inheritedStageScoring } from "./stage-scoring";
import { assertTournamentPairingWritable, isFrozenUitsigTournament } from "./swiss-sequencing-policy";
import { transitionIssues } from "./transition";
import { specDateIssues } from "./date-window";
import { bufferedDb, confirmStructuredPlayoffs, loadEntrants, rankSourcePools, resolveTieBreaks, startNextStructuredStage, type Db, type SourcePool } from "./structured-persist";
import type { TieBreakCriterion } from "./tie-breaks";
import { buildPlayoffChain } from "../smart-builder/playoff-chain";
import { divisionGroup, previewTransition, type SpecDivision, type TournamentSpec } from "./engine-service";

export type StageState = "waiting" | "ready" | "blocked" | "active" | "completed" | "deferred" | "needs_setup";

export interface StageStatus {
  divisionKey: string;
  divisionLabel: string;
  stageKey: string;
  name: string;
  state: StageState;
  /** true = this transition happens without an admin (predefined + resolvable). */
  automatic: boolean;
  /** Plain explanation; for `blocked` the exact thing to resolve. */
  detail: string;
  played: number;
  total: number;
  /** For needs_setup: the finished stage it follows. */
  afterStageKey?: string | null;
  plannedDate?: string | null;
}

/** Commit runner: tests apply directly, the app sends one server transaction. */
export type Exec = <T>(fn: (db: Db) => Promise<T>) => Promise<T>;

const sourceOf = (d: SpecDivision, st: PlannedStage): PlannedStage | null => {
  if (st.kind === "mapped" && (st.mapping?.source === "stage_standings" || st.mapping?.source === "stage_winners")) return d.stages.find((s) => s.id === st.mapping!.sourceStageId) ?? null;
  return d.stages.find((s) => s.order === st.order - 1) ?? null;
};

function stageDone(st: PlannedStage, rows: Array<Record<string, any>>): boolean {
  if (!rows.length) return false;
  const decided = rows.every((m) => isDecided({ status: m.status, winner: m.winner_member_id, score: m.score } as any));
  if (!decided) return false;
  if (st.kind === "knockout" || st.kind === "placement") {
    const last = Math.max(...rows.map((m) => m.round_number ?? 1));
    return rows.filter((m) => (m.round_number ?? 1) === last && m.stage_label !== "3rd place").length <= 1;
  }
  if (st.kind === "swiss") return Math.max(...rows.map((m) => m.round_number ?? 1)) >= (st.swissRounds ?? 1);
  return true;
}

/** Start one defined stage through the engine (qualifier play-offs or next stage / mapped positions). */
function startStage(db: Db, tid: string, d: SpecDivision, st: PlannedStage) {
  return progressionOf(st).mode === "qualifiers" && st.kind !== "mapped"
    ? confirmStructuredPlayoffs(db, tid, d.divisionId, st.id, true)
    : startNextStructuredStage(db, tid, d.divisionId, st.id, { ownerConfirmed: true });
}

/**
 * Play-off "Start this stage" from Stages & scheduling (the organiser's latest choice): the category's own row,
 * else the shared row for that round. null = no matching row, so the saved stage setting applies.
 */
export function setupStartsAutomatically(rows: any[] | undefined, divisionLabel: string, stageName: string): boolean | null {
  const rk = (n: string) => { const x = String(n).toLowerCase().replace(/[^a-z]/g, ""); return x.includes("quarter") ? "qf" : x.includes("semi") ? "sf" : x.endsWith("final") ? "final" : null; };
  const k = rk(stageName);
  if (!k || !Array.isArray(rows)) return null;
  const unit = String(divisionLabel).replace(/ · (Singles|Doubles|Singles and Doubles)$/i, "").split(" › ").join("::");
  const cand = rows.filter((r) => r?.phase === "playoff" && rk(r.name) === k && (r.start === "auto" || r.start === "confirm" || r.start === "organiser"));
  const r = cand.find((x) => x.unit && String(x.unit).split(" › ").join("::") === unit) ?? cand.find((x) => !x.unit);
  return r ? r.start === "auto" : null;
}

/** Seed-pool mapped stages are created with the tournament — never "progressed into". */
const createdUpFront = (st: PlannedStage) => st.kind === "mapped" && st.mapping?.source === "seed_pools";

export async function stageLifecycle(db: Db, tid: string): Promise<StageStatus[]> {
  const [t] = await db.select("tournaments", { id: tid });
  if (t?.builder_architecture !== "structured" || !t.builder_spec) return [];
  const spec = t.builder_spec as TournamentSpec;
  const all = await db.select("club_champs_matches", { champ_id: tid });
  const out: StageStatus[] = [];
  for (const [, d] of spec.divisions.entries()) {
    const mine = all.filter((m) => m.group_number === divisionGroup(spec, d));
    const ordered = [...d.stages].sort((a, b) => a.order - b.order);
    const done = new Map<string, boolean>();
    for (const st of ordered) {
      const rows = mine.filter((m) => m.stage_key === st.id);
      const played = rows.filter((m) => isDecided({ status: m.status, winner: m.winner_member_id, score: m.score } as any)).length;
      const base = { divisionKey: d.divisionId, divisionLabel: d.label, stageKey: st.id, name: st.name, played, total: rows.length };
      if (rows.length) {
        const c = stageDone(st, rows);
        done.set(st.id, c);
        out.push({ ...base, state: c ? "completed" : "active", automatic: false, detail: c ? "All games decided." : `${played} of ${rows.length} games decided.` });
        continue;
      }
      done.set(st.id, false);
      if (st.order === ordered[0].order || createdUpFront(st)) {
        out.push({ ...base, state: "waiting", automatic: false, detail: "Games are created when the tournament's games are generated." });
        continue;
      }
      const src = sourceOf(d, st);
      if (!src) { out.push({ ...base, state: "blocked", automatic: false, detail: `${st.name}: the stage it takes players from no longer exists.` }); continue; }
      const auto = setupStartsAutomatically(t?.beta_lifecycle?.answers?.stages, d.label, st.name) ?? !st.waitForOrganiser;
      const plannedDate = st.schedule?.date ?? st.schedule?.deadline ?? null;
      if (!done.get(src.id)) {
        out.push({ ...base, state: "waiting", automatic: auto, plannedDate, detail: auto ? `Starts automatically when ${src.name} is finished.` : `Offered for your confirmation when ${src.name} is finished.` });
        continue;
      }
      // Source finished: dry-run the real engine against a throwaway buffer (nothing is written).
      try {
        const b = bufferedDb(db);
        await startStage(b.db, tid, d, st);
        out.push({ ...base, state: "ready", automatic: auto, plannedDate, afterStageKey: src.id, detail: auto ? `${src.name} is finished — ${st.name} will be created now.` : `${src.name} is finished — confirm to create ${st.name}.` });
      } catch (e: any) {
        out.push({ ...base, state: "blocked", automatic: false, detail: e?.message ?? String(e) });
      }
    }
    // Deferred stages follow the last defined stage of the division.
    const last = ordered[ordered.length - 1];
    // A Swiss stage that finishes in round-robin groups is the end of the category: no play-offs follow.
    const endsInRr = !!(last as any)?.rrFinish?.enabled;
    (endsInRr ? [] : d.deferredStages ?? []).forEach((x, i) => {
      const due = i === 0 && !!last && !!done.get(last.id);
      out.push({
        divisionKey: d.divisionId, divisionLabel: d.label, stageKey: x.stageKey, name: x.name, played: 0, total: 0,
        state: due ? "needs_setup" : "deferred", automatic: false, afterStageKey: last?.id ?? null, plannedDate: x.plannedDate,
        detail: due ? `${last.name} is finished — set up ${x.name} to continue.` : `Define later — set up once ${i === 0 ? last?.name ?? "the stage before" : "the stage before"} is finished.`,
      });
    });
  }
  return out;
}

/**
 * Play-offs the organiser set to start automatically ("trigger: auto") but that were saved as
 * "set up later" become real predefined stages once the stage before them is finished, so the normal
 * automatic progression creates them. Only when every deferred stage has a complete auto plan and the
 * chain maps cleanly; anything else stays for the organiser.
 */
export async function promoteAutoDeferred(db: Db, tid: string, exec: Exec = (fn) => fn(db)): Promise<number> {
  const states = await stageLifecycle(db, tid);
  const due = states.filter((s) => s.state === "needs_setup");
  if (!due.length) return 0;
  return exec(async (tx) => {
    const [t] = await tx.select("tournaments", { id: tid });
    let spec = t?.builder_spec as TournamentSpec;
    if (!spec) return 0;
    let n = 0;
    for (const s of due) {
      const d = spec.divisions.find((x) => x.divisionId === s.divisionKey);
      const later = d?.deferredStages ?? [];
      if (!d || !later.length || later[0].stageKey !== s.stageKey) continue;
      if (!later.every((x) => x.plan && (x.plan as any).trigger === "auto")) continue;
      const main = [...d.stages].sort((a, b) => b.order - a.order)[0];
      const version = String(later[0].stageKey).replace(/-po\d+$/, "");
      const chain = buildPlayoffChain(main as any, version, later.map((x) => ({ name: x.name, plan: x.plan as any, stageKey: x.stageKey })), { bottomHalf: !!(d as any).playoffBottomHalf });
      if (chain.reason || !chain.stages.length || chain.stages.some((c) => d.stages.some((y) => y.id === c.id))) continue;
      spec = { ...spec, divisions: spec.divisions.map((x) => x !== d ? x : { ...x, stages: [...x.stages, ...chain.stages], deferredStages: [] }) };
      n++;
    }
    if (n) await tx.update("tournaments", { id: tid }, { builder_spec: spec });
    return n;
  });
}

export interface ProgressReport { started: StageStatus[]; blocked: StageStatus[]; needsSetup: StageStatus[] }

/**
 * Start every `ready` stage. Safe to call on every result save / page load: stages with games are
 * skipped, blocked stages are only reported, deferred stages are never generated.
 */
export async function autoProgress(db: Db, tid: string, exec: Exec = (fn) => fn(db)): Promise<ProgressReport> {
  const report: ProgressReport = { started: [], blocked: [], needsSetup: [] };
  if (isFrozenUitsigTournament(tid)) return report;
  await promoteAutoDeferred(db, tid, exec);
  for (let pass = 0; pass < 10; pass++) {
    const states = await stageLifecycle(db, tid);
    report.blocked = states.filter((s) => s.state === "blocked");
    report.needsSetup = states.filter((s) => s.state === "needs_setup");
    // Only stages set to start automatically; "Wait for organiser confirmation" stages are offered, never started here.
    const ready = states.filter((s) => s.state === "ready" && s.automatic);
    if (!ready.length) break;
    const [t] = await db.select("tournaments", { id: tid });
    const spec = t.builder_spec as TournamentSpec;
    for (const r of ready) {
      const d = spec.divisions.find((x) => x.divisionId === r.divisionKey)!;
      const st = d.stages.find((s) => s.id === r.stageKey)!;
      try {
        await exec((tx) => startStage(tx, tid, d, st));
        report.started.push(r);
      } catch (e: any) {
        // Another device got there first → the stage exists; anything else is held for the admin.
        if (!/already/i.test(e?.message ?? "")) report.blocked.push({ ...r, state: "blocked", automatic: false, detail: e?.message ?? String(e) });
      }
    }
  }
  return report;
}

/** Exactly the games a ready stage would create (dry run of the same engine call; nothing is written). */
export async function previewNextStage(db: Db, tid: string, divisionKey: string, stageKey: string): Promise<Array<Record<string, any>>> {
  const [t] = await db.select("tournaments", { id: tid });
  const spec = t.builder_spec as TournamentSpec;
  const d = spec.divisions.find((x) => x.divisionId === divisionKey);
  const st = d?.stages.find((s) => s.id === stageKey);
  if (!d || !st) throw new IntegrityError("no_stage", "That stage no longer exists.");
  const b = bufferedDb(db);
  await startStage(b.db, tid, d, st);
  return b.ops.flatMap((o: any) => (o.op === "insert" && o.table === "club_champs_matches" ? o.rows : []));
}

/** Organiser-confirmed start of a ready stage: same engine call as automatic progression, once. */
export async function confirmNextStage(db: Db, tid: string, divisionKey: string, stageKey: string, exec: Exec = (fn) => fn(db)) {
  const states = await stageLifecycle(db, tid);
  const me = states.find((s) => s.divisionKey === divisionKey && s.stageKey === stageKey);
  if (!me || me.state !== "ready") throw new IntegrityError("not_ready", me ? `${me.name}: ${me.detail}` : "That stage is not ready.");
  const [t] = await db.select("tournaments", { id: tid });
  const d = (t.builder_spec as TournamentSpec).divisions.find((x) => x.divisionId === divisionKey)!;
  const st = d.stages.find((s) => s.id === stageKey)!;
  return exec((tx) => startStage(tx, tid, d, st));
}

/* ───── deferred stage set-up on an EXISTING tournament ───── */

export interface DeferredSetup {
  kind: "mapped" | "knockout";
  /**
   * Retired: scoring is inherited from the category's saved structured settings (stage-scoring.ts).
   * Ignored if passed — never parsed. Older stages that saved a text value keep it untouched.
   */
  matchFormat?: string;
  discipline?: "singles" | "doubles";
  mapping?: PlannedStage["mapping"];
  qualify?: PlannedStage["qualify"];
  thirdPlace?: boolean;
  schedule?: PlannedStage["schedule"];
  /**
   * Remaining planning targets after this stage, taken from the saved Stages & Scheduling list. Append-only:
   * existing later stages must be a name-for-name prefix (keys kept); missing ones are added; none removed.
   */
  syncLater?: Array<{ stageKey: string; name: string; plannedDate: string | null; plan?: any }>;
}

export interface SetupCheck { structure: string[]; engine: string[]; schedule: string[]; scoring: string[] }
export const setupOk = (c: SetupCheck) => !c.structure.length && !c.engine.length && !c.schedule.length && !c.scoring.length;

/** Build the stage the admin configured, and the spec with it appended. Earlier stages are untouched. */
export function specWithSetup(spec: TournamentSpec, divisionKey: string, stageKey: string, setup: DeferredSetup): { spec: TournamentSpec; stage: PlannedStage } {
  const d = spec.divisions.find((x) => x.divisionId === divisionKey);
  if (!d) throw new IntegrityError("no_division", "Unknown division.");
  const later = (d.deferredStages ?? []).find((x) => x.stageKey === stageKey);
  if (!later) throw new IntegrityError("not_deferred", "That stage is not waiting to be set up.");
  if (d.stages.some((s) => s.id === stageKey)) throw new IntegrityError("duplicate_stage", `${later.name} already exists; it will not be added again.`);
  const rest = (d.deferredStages ?? []).filter((y) => y.stageKey !== stageKey);
  let nextLater = rest;
  if (setup.syncLater) {
    const ok = rest.every((y, i) => setup.syncLater![i] && setup.syncLater![i].stageKey === y.stageKey && setup.syncLater![i].name.toLowerCase() === y.name.toLowerCase());
    const keys = new Set([...d.stages.map((s) => s.id), stageKey]);
    if (!ok || setup.syncLater.some((y) => keys.has(y.stageKey))) throw new IntegrityError("later_mismatch", "The later stages disagree with the saved setup; nothing was changed.");
    nextLater = setup.syncLater.map((y) => ({ stageKey: y.stageKey, name: y.name, plannedDate: y.plannedDate, ...(y.plan ? { plan: y.plan } : {}) }));
  }
  const order = Math.max(0, ...d.stages.map((s) => s.order)) + 1;
  const stage: PlannedStage = {
    id: stageKey, order, name: later.name, kind: setup.kind, discipline: setup.discipline,
    schedule: setup.schedule ?? (later.plannedDate ? { rule: "fixed", date: later.plannedDate, roundDates: [later.plannedDate] } : { rule: "window" }),
    generation: "owner_approval",
    ...(setup.kind === "mapped" ? { mapping: setup.mapping ?? null, progression: { mode: "all_continue", standings: "reset" } } : {}),
    ...(setup.kind === "knockout" ? { qualify: setup.qualify ?? null, thirdPlace: !!setup.thirdPlace, progression: { mode: "qualifiers", standings: null } } : {}),
  };
  return {
    stage,
    spec: {
      ...spec,
      divisions: spec.divisions.map((x) => x !== d ? x : {
        ...x, stages: [...x.stages, stage], deferredStages: nextLater,
      }),
    },
  };
}

/** The four checks for a stage being set up now. Every list must be empty before it can be created. */
export async function checkDeferredSetup(db: Db, tid: string, divisionKey: string, stageKey: string, setup: DeferredSetup): Promise<SetupCheck> {
  const c: SetupCheck = { structure: [], engine: [], schedule: [], scoring: [] };
  const states = await stageLifecycle(db, tid);
  const me = states.find((s) => s.divisionKey === divisionKey && s.stageKey === stageKey);
  if (!me || me.state !== "needs_setup") { c.structure.push(me ? `${me.name} can't be set up yet — ${me.detail}` : "That stage is not waiting to be set up."); return c; }
  const [t] = await db.select("tournaments", { id: tid });
  let next: { spec: TournamentSpec; stage: PlannedStage };
  try { next = specWithSetup(t.builder_spec as TournamentSpec, divisionKey, stageKey, setup); } catch (e: any) { c.structure.push(e.message); return c; }
  const d = next.spec.divisions.find((x) => x.divisionId === divisionKey)!;
  const src = d.stages.find((s) => s.order === next.stage.order - 1)!;
  const sc = inheritedStageScoring(t, t.builder_spec as TournamentSpec, divisionKey);
  if (sc.ok === false) c.scoring.push((sc as { issue: string }).issue);
  if (setup.kind === "mapped") {
    c.structure.push(...mappingIssues(setup.mapping, next.stage.name));
    if (setup.mapping && setup.mapping.source !== "stage_standings") c.engine.push("A stage set up later must use finishing positions of a finished stage.");
  } else {
    if (src.kind !== "pools" && src.kind !== "round_robin") c.engine.push(`Knockout qualifiers can only come from a pools / round robin stage (${src.name} is ${src.kind}); use explicit matchups instead.`);
    if (!setup.qualify?.perPool && !setup.qualify?.transition) c.structure.push("Choose how many qualify from each pool.");
    if (setup.qualify?.transition) c.structure.push(...transitionIssues({ ...setup.qualify.transition, sourceStageId: src.id, destinationStageId: stageKey }, sourcePoolCount(src)).filter((i) => i.level === "error").map((i) => i.message));
  }
  c.structure.push(...contractIssues(d).filter((i) => i.level === "error" && i.stageId === stageKey).map((i) => i.message));
  const dates = specDateIssues({ ...next.spec, divisions: [{ ...d, stages: [next.stage] }] }, { start: t.start_date ?? null, end: t.end_date ?? null });
  c.schedule.push(...dates.map((x) => x.message));
  // Dry run of the real engine: resolves positions/ties/pairs/matchups without writing anything.
  if (setupOk(c)) {
    try {
      const b = bufferedDb(db);
      await b.db.update("tournaments", { id: tid }, { builder_spec: next.spec });
      await startStage(b.db, tid, d, next.stage);
    } catch (e: any) {
      (e?.code === "tie" || /tied|slot|no player/i.test(e?.message ?? "") ? c.structure : c.engine).push(e?.message ?? String(e));
    }
  }
  c.structure = [...new Set(c.structure)];
  return c;
}

/** Save the set-up stage and create ONLY its games, in one commit. Earlier stages/results are never touched. */
export async function setupDeferredStage(db: Db, tid: string, divisionKey: string, stageKey: string, setup: DeferredSetup, exec: Exec = (fn) => fn(db)) {
  assertTournamentPairingWritable(tid);
  const check = await checkDeferredSetup(db, tid, divisionKey, stageKey, setup);
  if (!setupOk(check)) throw new IntegrityError("setup", [...check.structure, ...check.engine, ...check.schedule, ...check.scoring].join("; "));
  return exec(async (tx) => {
    const [t] = await tx.select("tournaments", { id: tid });
    const next = specWithSetup(t.builder_spec as TournamentSpec, divisionKey, stageKey, setup);
    await tx.update("tournaments", { id: tid }, { builder_spec: next.spec });
    const d = (await loadEntrants(tx, tid, next.spec)).divisions.find((x) => x.divisionId === divisionKey)!;
    return startStage(tx, tid, d, next.stage);
  });
}

/** Record the admin's order for tied positions in one source stage pool (only fills genuine ties). */
export async function decidePositionOrder(db: Db, tid: string, divisionKey: string, stageKey: string, poolIndex: number, order: string[], exec: Exec = (fn) => fn(db)) {
  assertTournamentPairingWritable(tid);
  return exec(async (tx) => {
    const [t] = await tx.select("tournaments", { id: tid });
    const spec = t.builder_spec as TournamentSpec;
    const key = `${divisionKey}/${stageKey}`;
    const positionOrders = { ...(spec.positionOrders ?? {}), [key]: { ...(spec.positionOrders?.[key] ?? {}), [poolIndex]: order } };
    await tx.update("tournaments", { id: tid }, { builder_spec: { ...spec, positionOrders } });
  });
}

/** Save the tournament's tie-break order on the live spec (affects only stages not yet created). */
export async function saveTieBreakRules(db: Db, tid: string, tieBreaks: TieBreakCriterion[], exec: Exec = (fn) => fn(db)) {
  assertTournamentPairingWritable(tid);
  return exec(async (tx) => {
    const [t] = await tx.select("tournaments", { id: tid });
    if (t?.builder_architecture !== "structured" || !t.builder_spec) return;
    const spec = t.builder_spec as TournamentSpec;
    if (JSON.stringify(spec.tieBreaks ?? null) === JSON.stringify(tieBreaks)) return;
    await tx.update("tournaments", { id: tid }, { builder_spec: { ...spec, tieBreaks } });
  });
}

export interface StageTies { sourceStageKey: string; sourceName: string; nextName: string; criteria: TieBreakCriterion[]; pools: SourcePool[] }

/**
 * The ties that genuinely block `stageKey`: only groups still level after every automatic tie-break AND
 * touching a position that stage reads. Used by the manual "Decide tied order" fallback.
 */
export async function stageTies(db: Db, tid: string, divisionKey: string, stageKey: string): Promise<StageTies | null> {
  const [t] = await db.select("tournaments", { id: tid });
  const spec = await loadEntrants(db, tid, t.builder_spec as TournamentSpec);
  const d = spec.divisions.find((x) => x.divisionId === divisionKey);
  const st = d?.stages.find((s) => s.id === stageKey);
  if (!d || !st) return null;
  const src = sourceOf(d, st);
  if (!src) return null;
  let used: Set<string> | undefined;
  if (st.kind === "mapped" && st.mapping && st.mapping.source === "stage_standings") used = new Set(st.mapping.units.flatMap((u) => u.slots.map((s) => `${s.pool}:${s.position}`)));
  else {
    try { const cut = Math.max(0, ...previewTransition(d, stageKey).transition.positions); if (cut > 0) used = new Set(Array.from({ length: 64 }, (_, pi) => Array.from({ length: cut }, (_, k) => `${pi}:${k + 1}`)).flat()); } catch { /* every position matters */ }
  }
  const matches = (await db.select("club_champs_matches", { champ_id: tid })).filter((m) => m.group_number === divisionGroup(spec, d));
  const criteria = resolveTieBreaks(spec, d);
  const pools = rankSourcePools(d, src, matches, spec.positionOrders?.[`${divisionKey}/${src.id}`], used, criteria).filter((p) => p.material.length);
  return { sourceStageKey: src.id, sourceName: src.name, nextName: st.name, criteria, pools };
}

/**
 * Explicit organiser save only: start just the given (division, stage) pairs when they are `ready` and automatic —
 * e.g. a Quarterfinal attached after its pools already finished, so the real qualifiers appear straight away.
 * Never touches other categories or stages; stages with games are skipped by the engine guard.
 */
export async function startReadyStages(db: Db, tid: string, only: Array<{ divisionKey: string; stageKey: string }>, exec: Exec = (fn) => fn(db)): Promise<number> {
  if (!only.length) return 0;
  const want = new Set(only.map((o) => `${o.divisionKey}|${o.stageKey}`));
  const states = await stageLifecycle(db, tid);
  const ready = states.filter((s) => s.state === "ready" && s.automatic && want.has(`${s.divisionKey}|${s.stageKey}`));
  if (!ready.length) return 0;
  const [t] = await db.select("tournaments", { id: tid });
  const spec = t.builder_spec as TournamentSpec;
  let n = 0;
  for (const r of ready) {
    const d = spec.divisions.find((x) => x.divisionId === r.divisionKey);
    const st = d?.stages.find((s) => s.id === r.stageKey);
    if (!d || !st) continue;
    try { await exec((tx) => startStage(tx, tid, d, st)); n++; } catch (e: any) { if (!/already/i.test(e?.message ?? "")) throw e; }
  }
  return n;
}
