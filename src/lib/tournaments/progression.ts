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
import { transitionIssues } from "./transition";
import { specDateIssues } from "./date-window";
import { bufferedDb, confirmStructuredPlayoffs, loadEntrants, startNextStructuredStage, type Db } from "./structured-persist";
import type { SpecDivision, TournamentSpec } from "./engine-service";

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
  if (st.kind === "mapped" && st.mapping?.source === "stage_standings") return d.stages.find((s) => s.id === st.mapping!.sourceStageId) ?? null;
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

/** Seed-pool mapped stages are created with the tournament — never "progressed into". */
const createdUpFront = (st: PlannedStage) => st.kind === "mapped" && st.mapping?.source === "seed_pools";

export async function stageLifecycle(db: Db, tid: string): Promise<StageStatus[]> {
  const [t] = await db.select("tournaments", { id: tid });
  if (t?.builder_architecture !== "structured" || !t.builder_spec) return [];
  const spec = t.builder_spec as TournamentSpec;
  const all = await db.select("club_champs_matches", { champ_id: tid });
  const out: StageStatus[] = [];
  for (const [di, d] of spec.divisions.entries()) {
    const mine = all.filter((m) => m.group_number === di + 1);
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
      if (!done.get(src.id)) {
        out.push({ ...base, state: "waiting", automatic: true, detail: `Starts automatically when ${src.name} is finished.` });
        continue;
      }
      // Source finished: dry-run the real engine against a throwaway buffer (nothing is written).
      try {
        const b = bufferedDb(db);
        await startStage(b.db, tid, d, st);
        out.push({ ...base, state: "ready", automatic: true, detail: `${src.name} is finished — ${st.name} will be created now.` });
      } catch (e: any) {
        out.push({ ...base, state: "blocked", automatic: false, detail: e?.message ?? String(e) });
      }
    }
    // Deferred stages follow the last defined stage of the division.
    const last = ordered[ordered.length - 1];
    (d.deferredStages ?? []).forEach((x, i) => {
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

export interface ProgressReport { started: StageStatus[]; blocked: StageStatus[]; needsSetup: StageStatus[] }

/**
 * Start every `ready` stage. Safe to call on every result save / page load: stages with games are
 * skipped, blocked stages are only reported, deferred stages are never generated.
 */
export async function autoProgress(db: Db, tid: string, exec: Exec = (fn) => fn(db)): Promise<ProgressReport> {
  const report: ProgressReport = { started: [], blocked: [], needsSetup: [] };
  for (let pass = 0; pass < 10; pass++) {
    const states = await stageLifecycle(db, tid);
    report.blocked = states.filter((s) => s.state === "blocked");
    report.needsSetup = states.filter((s) => s.state === "needs_setup");
    const ready = states.filter((s) => s.state === "ready");
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

/* ───── deferred stage set-up on an EXISTING tournament ───── */

export interface DeferredSetup {
  kind: "mapped" | "knockout";
  /** Required: how each game is scored (e.g. "PAR 11, best of 5"). */
  matchFormat: string;
  discipline?: "singles" | "doubles";
  mapping?: PlannedStage["mapping"];
  qualify?: PlannedStage["qualify"];
  thirdPlace?: boolean;
  schedule?: PlannedStage["schedule"];
}

export interface SetupCheck { structure: string[]; engine: string[]; schedule: string[]; scoring: string[] }
export const setupOk = (c: SetupCheck) => !c.structure.length && !c.engine.length && !c.schedule.length && !c.scoring.length;

/** Build the stage the admin configured, and the spec with it appended. Earlier stages are untouched. */
export function specWithSetup(spec: TournamentSpec, divisionKey: string, stageKey: string, setup: DeferredSetup): { spec: TournamentSpec; stage: PlannedStage } {
  const d = spec.divisions.find((x) => x.divisionId === divisionKey);
  if (!d) throw new IntegrityError("no_division", "Unknown division.");
  const later = (d.deferredStages ?? []).find((x) => x.stageKey === stageKey);
  if (!later) throw new IntegrityError("not_deferred", "That stage is not waiting to be set up.");
  const order = Math.max(0, ...d.stages.map((s) => s.order)) + 1;
  const stage: PlannedStage = {
    id: stageKey, order, name: later.name, kind: setup.kind, discipline: setup.discipline,
    schedule: setup.schedule ?? (later.plannedDate ? { rule: "fixed", date: later.plannedDate, roundDates: [later.plannedDate] } : { rule: "window" }),
    generation: "owner_approval",
    ...(setup.kind === "mapped" ? { mapping: setup.mapping ?? null, progression: { mode: "all_continue", standings: "reset" } } : {}),
    ...(setup.kind === "knockout" ? { qualify: setup.qualify ?? null, thirdPlace: !!setup.thirdPlace, progression: { mode: "qualifiers", standings: null } } : {}),
    ...({ matchFormat: setup.matchFormat } as object),
  };
  return {
    stage,
    spec: {
      ...spec,
      divisions: spec.divisions.map((x) => x !== d ? x : {
        ...x, stages: [...x.stages, stage], deferredStages: (x.deferredStages ?? []).filter((y) => y.stageKey !== stageKey),
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
  if (!setup.matchFormat?.trim()) c.scoring.push("Choose how each game is scored (match format).");
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
  return exec(async (tx) => {
    const [t] = await tx.select("tournaments", { id: tid });
    const spec = t.builder_spec as TournamentSpec;
    const key = `${divisionKey}/${stageKey}`;
    const positionOrders = { ...(spec.positionOrders ?? {}), [key]: { ...(spec.positionOrders?.[key] ?? {}), [poolIndex]: order } };
    await tx.update("tournaments", { id: tid }, { builder_spec: { ...spec, positionOrders } });
  });
}
