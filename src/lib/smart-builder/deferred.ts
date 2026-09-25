/**
 * "Define later" stages (semi-finals, finals, similar later play-offs).
 *
 * A deferred stage is an INTENTIONAL state, never an incomplete one:
 * - it is kept in the draft (name, planned dates, notes) as a planning target;
 * - it is excluded from structure / engine / schedule / scoring validation, so it can
 *   never block Create for the stages that must run now;
 * - it is NOT persisted as a runnable stage, so the tournament can never advance into it;
 * - once the stage before it has finished, the admin configures it (turning "Define later"
 *   off) and it must then pass every normal check before it can be generated.
 */
import { allStages, type Stage, type TournamentDefinition } from "./definition";

export const isDeferred = (s: Stage) => s.defineLater === true;

export interface DeferredStageInfo {
  divisionId: string;
  divisionName: string;
  stageId: string;
  stageName: string;
  /** Planning target only — a date never forces the format to be decided. */
  plannedDate: string | null;
}

export function deferredStages(def: TournamentDefinition): DeferredStageInfo[] {
  return allStages(def)
    .filter((r) => isDeferred(r.stage))
    .map(({ division, stage }) => ({
      divisionId: division.id,
      divisionName: division.name,
      stageId: stage.id,
      stageName: stage.name,
      plannedDate: stage.schedule?.startDate?.slice(0, 10) ?? stage.schedule?.roundDates?.[0]?.slice(0, 10) ?? null,
    }));
}

export const hasDeferred = (def: TournamentDefinition) => allStages(def).some((r) => isDeferred(r.stage));

/**
 * The definition WITHOUT deferred stages — what actually has to be created and run now.
 * Every validator, the schedule maths, the engine mapping and the Create spec read this.
 */
export function definedOnly(def: TournamentDefinition): TournamentDefinition {
  if (!hasDeferred(def)) return def;
  const strip = (id: string | null | undefined) => id ?? null;
  const deferredIds = new Set(allStages(def).filter((r) => isDeferred(r.stage)).map((r) => r.stage.id));
  return {
    ...def,
    divisions: def.divisions.map((d) => ({
      ...d,
      sections: d.sections.map((sec) => ({
        ...sec,
        stages: sec.stages.filter((s) => !isDeferred(s)).map((s) =>
          deferredIds.has(strip(s.input?.fromStageId) ?? "") ? { ...s, input: { ...s.input, fromStageId: null } } : s),
      })),
    })),
  };
}

export const deferredLabel = (s: Stage) => `${s.name} — Define later`;

/** Review: how each stage after the first begins — created with the tournament, automatically, or Define later. */
export function transitionPlan(def: TournamentDefinition): Array<{ divisionName: string; stageName: string; how: "with_tournament" | "automatic" | "define_later"; text: string }> {
  const out: ReturnType<typeof transitionPlan> = [];
  for (const d of def.divisions) {
    const stages = d.sections.flatMap((s) => s.stages).filter((s) => s.kind !== "pair_from_positions" && s.kind !== "split");
    stages.forEach((s, i) => {
      if (i === 0) return;
      const src = stages.find((x) => x.id === (s.mapping?.source === "stage_standings" ? s.mapping.sourceStageId : s.input?.fromStageId)) ?? stages[i - 1];
      if (isDeferred(s)) out.push({ divisionName: d.name, stageName: s.name, how: "define_later", text: `${s.name} — Define later: you'll be asked to set it up when ${src.name} finishes.` });
      else if (s.kind === "cross_pool_league" && (s.mapping?.source ?? "seed_pools") === "seed_pools" && !s.input?.fromStageId)
        out.push({ divisionName: d.name, stageName: s.name, how: "with_tournament", text: `${s.name} — created with the tournament (same seeded pools).` });
      else out.push({ divisionName: d.name, stageName: s.name, how: "automatic", text: `${s.name} — starts automatically when ${src.name} finishes (held for you if a tie or result needs a decision).` });
    });
  }
  return out;
}

/*
 * ── One rule for what may be deferred ────────────────────────────────────────
 * "Define later" means "set this up once the stage before it has finished". So:
 *  - the FIRST stage of a division can never be deferred (nothing finishes before it);
 *  - a stage played in the SAME SESSION as a defined stage can't be deferred (it plays
 *    straight after, on the same evening — there is no "after it finishes");
 *  - deferral is always a SUFFIX: once a stage is deferred, every later stage is too.
 * These are enforced when the admin ticks the box, repaired on load, and reported by the validator.
 */
type DivLike = { name?: string; sections?: Array<{ stages?: Stage[] }> };
const stagesOfDiv = (d: DivLike): Stage[] => (d.sections ?? []).flatMap((s) => s.stages ?? []);

/** Why a stage can't be deferred, or null when it can. */
export function cannotDefer(d: DivLike, stageId: string): string | null {
  const ss = stagesOfDiv(d);
  const i = ss.findIndex((s) => s.id === stageId);
  if (i <= 0) return "The first stage is always set up now — nothing finishes before it.";
  const s = ss[i];
  const partner = s.sameSessionAs ? ss.find((x) => x.id === s.sameSessionAs) : null;
  if (partner && !partner.defineLater) return `Played in the same session as ${partner.name}, so it's set up with it.`;
  return null;
}

/**
 * Tick/untick "Define later" keeping the suffix rule: deferring a stage defers every later stage;
 * defining a stage defines every earlier one. Returns false (and changes nothing) when not allowed.
 */
export function setDefineLater(d: DivLike, stageId: string, on: boolean): boolean {
  const ss = stagesOfDiv(d);
  const i = ss.findIndex((s) => s.id === stageId);
  if (i < 0) return false;
  if (on) {
    if (cannotDefer(d, stageId)) return false;
    for (let k = i; k < ss.length; k++) { ss[k].defineLater = true; ss[k].sameSessionAs = null; }
  } else {
    for (let k = 0; k <= i; k++) ss[k].defineLater = undefined;
  }
  return true;
}

/** Load-time repair of drafts saved before the rule existed. Never defers anything new. */
export function normalizeDeferral<T extends { divisions?: DivLike[] }>(def: T): T {
  for (const d of def.divisions ?? []) {
    const ss = stagesOfDiv(d);
    ss.forEach((s, i) => {
      if (!s.defineLater) return;
      const partner = s.sameSessionAs ? ss.find((x) => x.id === s.sameSessionAs) : null;
      if (i === 0 || (partner && !partner.defineLater)) s.defineLater = undefined;
    });
    // Suffix: a defined stage after a deferred one makes the earlier deferral meaningless — define it.
    let lastDefined = -1;
    ss.forEach((s, i) => { if (!s.defineLater) lastDefined = i; });
    for (let k = 0; k < lastDefined; k++) ss[k].defineLater = undefined;
    ss.forEach((s) => { if (s.defineLater) s.sameSessionAs = null; });
  }
  return def;
}

/** Validator errors for a definition that breaks the rule (only reachable via hand-edited data). */
export function deferralIssues(def: { divisions?: DivLike[] }): Array<{ stageId: string; message: string }> {
  const out: Array<{ stageId: string; message: string }> = [];
  for (const d of def.divisions ?? []) {
    const ss = stagesOfDiv(d);
    ss.forEach((s, i) => {
      if (!s.defineLater) {
        const earlier = ss.slice(0, i).find((x) => x.defineLater);
        if (earlier) out.push({ stageId: s.id, message: `${d.name} · ${s.name} is set up now but comes after ${earlier.name}, which is Define later.` });
        return;
      }
      const why = cannotDefer(d, s.id);
      if (why) out.push({ stageId: s.id, message: `${d.name} · ${s.name} can't be Define later: ${why}` });
    });
  }
  return out;
}
