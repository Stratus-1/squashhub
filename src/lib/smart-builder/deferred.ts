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
