/**
 * One authoritative tournament default format; categories inherit it unless they hold an explicit override.
 * Recommendations are advisory: applying one equal to the default stores no override (no redundant data);
 * not applying one never changes anything. Existing saved overrides are always preserved as-is.
 */
export interface FormatLike { kind?: string | null; swissRounds?: string; swissRoundsConfirmed?: string; pools?: string }
export interface FormatAnswers<F extends FormatLike = FormatLike> { format: F; formatOverrides?: Record<string, F> }

export type FormatSource = "default" | "category" | "override" | "unset";

export function formatSource(a: FormatAnswers, key: string): FormatSource {
  if (a.formatOverrides?.[key]) return "override";
  if (key.includes("::") && a.formatOverrides?.[key.split("::")[0]]) return "category";
  return a.format?.kind ? "default" : "unset";
}

const sameFormat = (x: FormatLike, y: FormatLike) =>
  (x.kind ?? null) === (y.kind ?? null) && (x.kind !== "swiss" || String(x.swissRounds ?? "") === String(y.swissRounds ?? "")) && (x.kind !== "pools" || String(x.pools ?? "") === String(y.pools ?? ""));

/** Apply a chosen format to one category: equal to the default → inherit (drop override); otherwise explicit override. */
export function setCategoryFormat<F extends FormatLike, A extends FormatAnswers<F>>(a: A, key: string, f: F): A {
  const next = { ...(a.formatOverrides ?? {}) } as Record<string, F>;
  if (a.format?.kind && sameFormat(f, a.format)) delete next[key]; else next[key] = f;
  return { ...a, formatOverrides: next };
}

export function resetCategoryFormat<A extends FormatAnswers>(a: A, key: string): A {
  const next = { ...(a.formatOverrides ?? {}) };
  delete next[key];
  return { ...a, formatOverrides: next };
}

/** Categories that would end up with no format at all (no default, no override). */
export const unsetCategories = (a: FormatAnswers, keys: string[]) => keys.filter((k) => formatSource(a, k) === "unset");
