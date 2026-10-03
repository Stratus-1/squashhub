/**
 * Step-by-Step Beta templates — pure helpers.
 *
 * A template is the *structure* of a Step-by-Step setup (the same StepAnswers
 * object the builder uses) with every event-specific or transactional value
 * stripped. Starting from a template returns a fresh deep copy, so the saved
 * template (or the code-shipped pre-built one) is never modified.
 */
import type { StepAnswers } from "@/components/smart-builder/StepByStepBuilder";

export const STEP_TEMPLATE_KEY = "step_by_step";
export const TEMPLATE_VERSION = 1;

export type StepTemplate = { v: number; answers: Partial<StepAnswers> };

/** Fields the organiser must review for the new event (shown as a checklist). */
export const REVIEW_FIELDS = [
  "Tournament name",
  "Dates",
  "Days, venues & courts",
  "Expected entries",
  "Picked players & pairs",
  "Fee amounts",
  "WhatsApp group link",
] as const;

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x ?? null));
const rid = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

/** Strip event-specific and transactional data, keeping the reusable structure. */
export function toStepTemplate(a: StepAnswers): StepTemplate {
  const c = clone(a) as Partial<StepAnswers> & Record<string, unknown>;
  delete c.planId;
  delete c.createdTournamentId;
  delete c.pairs;
  c.name = "";
  c.periodStart = "";
  c.periodEnd = "";
  c.syncCutoff = "";
  c.entries = "";
  c.unitEntries = {};
  c.days = [];
  c.picks = {};
  if (c.waGroup) c.waGroup = { use: c.waGroup.use, url: "", include: c.waGroup.include };
  if (c.fee) {
    const perUnit = Object.fromEntries(Object.keys(c.fee.perUnit ?? {}).map((k) => [k, ""]));
    c.fee = { ...c.fee, amount: "", perUnit };
  }
  c.stages = (c.stages ?? []).map((s) => ({ ...s, deadline: "", date: "", from: "", to: "", courtIds: [] }));
  c.split = Object.fromEntries(Object.entries(c.split ?? {}).map(([k, v]) => [k, { ...v, mainEnd: "" }]));
  return { v: TEMPLATE_VERSION, answers: c };
}

/** A fresh, independent copy of the template's answers for a new tournament. */
export function fromStepTemplate(t: StepTemplate): Partial<StepAnswers> {
  const c = clone(t.answers) as Partial<StepAnswers>;
  delete c.createdTournamentId;
  c.planId = rid();
  c.stages = (c.stages ?? []).map((s) => ({ ...s, id: rid() }));
  return c;
}

/** True when a device-local plan holds meaningful work worth confirming before replacing. */
export function hasPlanInProgress(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const p = JSON.parse(raw) as Partial<StepAnswers>;
    return !!(p.kind || p.playType || p.name || p.createdTournamentId || (p.categories ?? []).some(Boolean));
  } catch { return false; }
}

export type PrebuiltTemplate = {
  key: string;
  name: string;
  description: string;
  /** Which existing builder can run this format. */
  target: "legacy_draft" | "step" | "diamond";
};

/** SquashHub system templates, shipped in code so no master copy can be overwritten. */
export const PREBUILT_TEMPLATES: PrebuiltTemplate[] = [
  {
    key: "diamond_league",
    name: "Diamond League",
    description: "Team event of singles and doubles with weekly pool ties and crossover play-offs. Opens the proven Diamond League setup.",
    target: "diamond",
  },
];
