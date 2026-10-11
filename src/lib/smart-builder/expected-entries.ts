/**
 * Provisional expected entries — ONE canonical store.
 *
 * Canonical value per group (category, or `Category::Sub`) is `answers.unitEntries[key]`.
 * The Structure guide edits it directly; `guide.expected[cat]` is kept only as a mirror of the
 * category total (older drafts may still hold a different, earlier guess there).
 *
 * Legacy drafts used two steps (Structure guide + Expected entries) that could disagree.
 * A disagreement is surfaced as a conflict for the admin to resolve — never silently overwritten.
 * Actual selected/registered entries always win for the final draw; estimates are planning only.
 */
export type EstimateAnswers = {
  subcats?: Record<string, string[]>;
  unitEntries?: Record<string, string>;
  guide?: { expected?: Record<string, string>; estimateResolutions?: Record<string, EstimateResolution> } & Record<string, any>;
};
export type EstimateResolution = { chosen: number; guide: number; steps: number; at: string };
export type EstimateConflict = { cat: string; guide: number; steps: number };

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };
export const subKeys = (a: EstimateAnswers, cat: string) =>
  (a.subcats?.[cat] ?? []).map((s) => s.trim()).filter(Boolean).map((s) => `${cat}::${s}`);

/** Canonical category estimate: sum of subcategory estimates, else the category's own, else the legacy guide guess. */
export function categoryEstimate(a: EstimateAnswers, cat: string): number {
  const subs = subKeys(a, cat);
  const fromUnits = subs.length ? subs.reduce((t, k) => t + n(a.unitEntries?.[k]), 0) : n(a.unitEntries?.[cat]);
  return fromUnits || n(a.guide?.expected?.[cat]);
}

/** Categories where the old Structure guide guess and the old Expected entries answer disagree and the admin hasn't chosen. */
export function estimateConflicts(a: EstimateAnswers, cats: string[]): EstimateConflict[] {
  return cats.flatMap((cat) => {
    const g = n(a.guide?.expected?.[cat]);
    const subs = subKeys(a, cat);
    const s = subs.length ? subs.reduce((t, k) => t + n(a.unitEntries?.[k]), 0) : n(a.unitEntries?.[cat]);
    if (!g || !s || g === s) return [];
    return [{ cat, guide: g, steps: s }];
  });
}

/** Write one group's estimate and keep the category mirror equal to the canonical total. */
export function setEstimate<T extends EstimateAnswers>(a: T, cat: string, key: string, value: string): T {
  const unitEntries = { ...(a.unitEntries ?? {}), [key]: value };
  const next = { ...a, unitEntries } as T;
  const total = subKeys(next, cat).length ? categoryEstimate({ ...next, guide: {} }, cat) : n(value);
  return { ...next, guide: { ...(a.guide ?? {}), expected: { ...(a.guide?.expected ?? {}), [cat]: total ? String(total) : "" } } };
}

/**
 * Admin resolves a legacy conflict. Choosing the old Expected-entries value keeps subcategory splits;
 * choosing the Structure guide value updates the category; with subcategories the admin edits each row instead.
 * The choice is recorded on `guide.estimateResolutions` for audit.
 */
export function resolveEstimate<T extends EstimateAnswers>(a: T, c: EstimateConflict, pick: "guide" | "steps", at = new Date().toISOString()): T {
  const chosen = pick === "guide" ? c.guide : c.steps;
  const audit = { ...(a.guide?.estimateResolutions ?? {}), [c.cat]: { chosen, guide: c.guide, steps: c.steps, at } };
  const hasSubs = subKeys(a, c.cat).length > 0;
  const unitEntries = hasSubs || pick === "steps" ? a.unitEntries : { ...(a.unitEntries ?? {}), [c.cat]: String(chosen) };
  if (hasSubs && pick === "guide") throw new Error("Subcategory estimates must be edited per subcategory");
  const expected = { ...(a.guide?.expected ?? {}), [c.cat]: String(chosen) };
  return { ...a, unitEntries, guide: { ...(a.guide ?? {}), expected, estimateResolutions: audit } };
}
