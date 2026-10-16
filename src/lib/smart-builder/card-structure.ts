import type { StepAnswers } from "@/components/smart-builder/StepByStepBuilder";
import { structureUnits, structureRowIssues, rowStages, writeRowStages } from "./structure-rows";
import { newStageId, validateStagePlan, type StageKind, type StagePlanItem } from "./stage-plan";
import { rrIssues } from "./rr-topology";

/** One-page structure flow: always on for Riverside; other clubs via the `tournament_card_structure` club_beta_features row (staged rollout). */
export function cardStructurePilot(clubId: string, _hostname: string, _tournamentId?: string, enabled = false) {
  return clubId === "11111111-1111-1111-1111-111111111111" || enabled;
}

export const MERGED_STRUCTURE_STEPS = ["What", "Match", "Categories", "Guide", "Subcategories", "Overrides", "Format"];
export function mergeCardStructureSteps<T extends string>(steps: T[], structure: T): T[] {
  const at = steps.findIndex((s) => MERGED_STRUCTURE_STEPS.includes(s));
  if (at < 0) return steps;
  return [...steps.slice(0, at), structure, ...steps.slice(at).filter((s) => !MERGED_STRUCTURE_STEPS.includes(s))];
}

/**
 * The card-structure screen sets seeding per category, so this pilot's flow has
 * no separate Seeding step. Other flows keep theirs untouched.
 */
export function dropCardStructureSeedingStep<T extends string>(steps: T[]): T[] {
  return steps.filter((s) => (s as string) !== "Seeding");
}

export function cardStructureIssues(a: StepAnswers): string[] {
  const errors = [...structureRowIssues(a)];
  if (!a.scoring) errors.push("Choose the default match rules.");
  const checkScoring = (s: StepAnswers["scoring"], key: string) => {
    if (s?.mode === "time_capped_points" && !(Number(s.timeCapPlay) > 0 || Number(s.timeCapMinutes) > 0)) errors.push(`${key}: set Bells playing time.`);
  };
  checkScoring(a.scoring, "Default rules");
  for (const key of structureUnits(a)) {
    checkScoring(a.scoringOverrides[key] ?? a.scoringOverrides[key.split("::")[0]] ?? a.scoring, key);
    const n = Number(a.unitEntries[key]) || 0;
    if (!Number.isInteger(n) || n < 1) errors.push(`${key}: enter the expected number of entries.`);
    const plan = rowStages(a, key);
    errors.push(...validateStagePlan(plan, { entrants: n }).filter((e) => e.level === "error").map((e) => `${key}: ${e.message}`));
    const s = plan[0];
    if (s?.kind === "pools" || s?.kind === "round_robin") {
      errors.push(...rrIssues(n, s.pools ?? 1, s.rrTopology).map((e) => `${key}: ${e}`));
      const names = s.poolNames ?? [];
      if (names.some((x) => !x.trim()) || new Set(names.map((x) => x.trim().toLowerCase())).size !== names.length) errors.push(`${key}: pool names must be non-empty and unique.`);
    }
  }
  return [...new Set(errors)];
}

export function addCardDivision(a: StepAnswers, kind: StageKind): { answers: StepAnswers; name: string } {
  const cats = a.categories.filter((c) => c.trim());
  let i = cats.length + 1;
  while (cats.includes(`Division ${i}`)) i++;
  const name = `Division ${i}`;
  const next = { ...a, categories: [...cats, name], categoryTypes: { ...a.categoryTypes, [name]: "open" as const }, disc: { ...a.disc, [name]: "singles" as const } };
  return { name, answers: writeRowStages(next, name, [{ id: newStageId(), kind, pools: kind === "round_robin" ? 1 : null, rounds: kind === "swiss" ? 5 : null }]) };
}

export function addCardSubdivision(a: StepAnswers, cat: string): { answers: StepAnswers; key: string } {
  const subs = a.subcats[cat] ?? [];
  let i = subs.length + 1;
  while (subs.includes(`Group ${i}`)) i++;
  const name = `Group ${i}`, key = `${cat}::${name}`;
  const next = { ...a, subcats: { ...a.subcats, [cat]: [...subs, name] }, disc: { ...a.disc, [key]: a.disc[cat] ?? "singles" as const }, unitEntries: { ...a.unitEntries, [key]: subs.length ? "" : a.unitEntries[cat] ?? "" } };
  return { key, answers: writeRowStages(next, key, rowStages(a, cat).map((s) => ({ ...structuredClone(s), id: newStageId() }))) };
}

export function patchCardStage(a: StepAnswers, key: string, patch: Partial<StagePlanItem>) {
  const plan = rowStages(a, key);
  const first = { ...plan[0], ...patch, id: plan[0]?.id ?? newStageId() };
  return writeRowStages(a, key, [first, ...plan.slice(1)]);
}

/** Preserve dates, courts, future stages and entrants; derive only the combined discipline answer. */
export function saveCardStructure(a: StepAnswers): StepAnswers {
  const ds = structureUnits(a).map((k) => a.disc[k] ?? a.disc[k.split("::")[0]] ?? "singles");
  return { ...a, playType: ds.every((d) => d === "singles") ? "singles" : ds.every((d) => d === "doubles") ? "doubles" : "both" };
}