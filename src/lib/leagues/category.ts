/**
 * Phase 3 — competition category as a first-class attribute.
 *
 * Every league/competition (Singles, Doubles or Hybrid) carries a category:
 * Men's, Ladies, Mixed or Open.
 *
 * IMPORTANT domain rule: `open` is NOT a synonym for `mixed`.
 *  - `mixed` may require a mixed-gender pair/team, but only when the league
 *    rules explicitly say so (`requireMixedPair`).
 *  - `open` never restricts by gender — any eligible combination is allowed.
 *
 * Nothing here hard-codes gender into Doubles: Men's / Ladies / Mixed / Open
 * Doubles are all valid, and the same helpers serve Singles and Hybrid.
 */

export const COMPETITION_CATEGORIES = ["mens", "ladies", "mixed", "open"] as const;
export type CompetitionCategory = (typeof COMPETITION_CATEGORIES)[number];

export const COMPETITION_DISCIPLINES = ["singles", "doubles", "hybrid"] as const;
export type CompetitionDiscipline = (typeof COMPETITION_DISCIPLINES)[number];

export const CATEGORY_LABELS: Record<CompetitionCategory, string> = {
  mens: "Men's",
  ladies: "Ladies",
  mixed: "Mixed",
  open: "Open",
};

export const DISCIPLINE_LABELS: Record<CompetitionDiscipline, string> = {
  singles: "Singles",
  doubles: "Doubles",
  hybrid: "Hybrid",
};

export function isCompetitionCategory(v: unknown): v is CompetitionCategory {
  return typeof v === "string" && (COMPETITION_CATEGORIES as readonly string[]).includes(v);
}

export function isCompetitionDiscipline(v: unknown): v is CompetitionDiscipline {
  return typeof v === "string" && (COMPETITION_DISCIPLINES as readonly string[]).includes(v);
}

export function categoryLabel(v: unknown): string {
  return isCompetitionCategory(v) ? CATEGORY_LABELS[v] : "Uncategorised";
}

/** e.g. "Ladies Doubles", "Open Singles". */
export function competitionLabel(
  category: unknown,
  discipline: unknown,
): string {
  const c = isCompetitionCategory(category) ? CATEGORY_LABELS[category] : null;
  const d = isCompetitionDiscipline(discipline) ? DISCIPLINE_LABELS[discipline] : null;
  return [c, d].filter(Boolean).join(" ") || "Competition";
}

/**
 * Derive a category from a free-text label (NSA division, league name), but
 * ONLY when it is provable. Anything ambiguous returns null — never guessed.
 */
export function inferCategory(label?: string | null): CompetitionCategory | null {
  const t = (label ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/^(mixed)\b/.test(t) || /\bmixed\b/.test(t)) return "mixed";
  if (/^(open)\b/.test(t) || /\bopen\b/.test(t)) return "open";
  if (/\b(ladies|women|women's|womens)\b/.test(t)) return "ladies";
  if (/\b(men|men's|mens)\b/.test(t)) return "mens";
  return null;
}

/* ── Player gender ───────────────────────────────────────────────────────── */

export type PlayerGender = "male" | "female" | "unknown";

/** Normalise the many stored spellings ("Ladies", "F", "Female", "Men"). */
export function normaliseGender(v?: string | null): PlayerGender {
  const t = (v ?? "").trim().toLowerCase();
  if (!t) return "unknown";
  if (/^(f|female|ladies|lady|woman|women)$/.test(t)) return "female";
  if (/^(m|male|men|man|mens|men's|gents)$/.test(t)) return "male";
  return "unknown";
}

/* ── Eligibility ─────────────────────────────────────────────────────────── */

/**
 * Is a single player eligible for a competition of this category?
 * `open` and `mixed` never exclude an individual — Mixed constrains the *pair*,
 * not the person. Unknown gender is only rejected by a gendered category.
 */
export function isPlayerEligibleForCategory(
  gender: string | null | undefined,
  category: CompetitionCategory | null | undefined,
): boolean {
  if (!isCompetitionCategory(category)) return true; // uncategorised legacy league
  if (category === "open" || category === "mixed") return true;
  const g = normaliseGender(gender);
  if (g === "unknown") return false;
  return category === "mens" ? g === "male" : g === "female";
}

export interface PairCompositionResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate a pair/team composition for Doubles (or Hybrid doubles rubbers).
 *
 * - `mens` / `ladies`: every player must match the category.
 * - `mixed`: mixed-gender composition enforced ONLY when the league rules ask
 *   for it (`requireMixedPair`).
 * - `open`: always valid, any gender combination.
 */
export function validatePairComposition(
  genders: Array<string | null | undefined>,
  category: CompetitionCategory | null | undefined,
  opts: { requireMixedPair?: boolean } = {},
): PairCompositionResult {
  if (!isCompetitionCategory(category)) return { valid: true };
  if (category === "open") return { valid: true };

  const norm = genders.map(normaliseGender);

  if (category === "mens" || category === "ladies") {
    const want: PlayerGender = category === "mens" ? "male" : "female";
    if (norm.some((g) => g !== want)) {
      return { valid: false, reason: `${CATEGORY_LABELS[category]} requires all players to be ${want}.` };
    }
    return { valid: true };
  }

  // mixed
  if (!opts.requireMixedPair) return { valid: true };
  const hasMale = norm.includes("male");
  const hasFemale = norm.includes("female");
  if (!hasMale || !hasFemale) {
    return { valid: false, reason: "Mixed requires at least one male and one female player." };
  }
  return { valid: true };
}
