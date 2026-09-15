/**
 * Standard family memberships.
 *
 * The two family fee types use fixed system names across every club —
 * only the amounts and the package settings are club-configured.
 */

export const FAMILY_PRIMARY_LABEL = "Family Package";
export const FAMILY_ADDITIONAL_LABEL = "Additional Family Member";

export type FamilyRole = "primary" | "additional" | null;

export const FAMILY_RELATIONSHIPS = [
  { value: "spouse", label: "Spouse / partner" },
  { value: "child", label: "Child / dependent" },
  { value: "other", label: "Other family member" },
] as const;

export interface FamilyCategory {
  id: string;
  name: string;
  description?: string | null;
  annual_fee: number;
  family_role?: FamilyRole;
  family_max_additional?: number | null;
  family_allowed_relationships?: string[] | null;
  family_dependent_max_age?: number | null;
  family_additional_category_id?: string | null;
  pro_rate?: boolean | null;
}

/** Display name for a category — standard names win for family types. */
export function familyDisplayName(cat: Pick<FamilyCategory, "name" | "family_role">): string {
  if (cat.family_role === "primary") return FAMILY_PRIMARY_LABEL;
  if (cat.family_role === "additional") return FAMILY_ADDITIONAL_LABEL;
  return cat.name;
}

const AMBIGUOUS = ["spouse", "scholar", "junior", "student", "pensioner", "senior", "social"];
const ADDITIONAL_HINTS = ["additional family", "extra family", "family member", "member of family", "family extra", "family members"];
const PRIMARY_HINTS = ["family package", "family plan", "family membership", "main family", "family ("];

/**
 * Migration helper: suggest a family role from a club's existing category
 * wording. Ambiguous standalone types are never suggested — they stay as they
 * are and are flagged for club-admin review instead.
 */
export function suggestFamilyRole(name: string, description?: string | null): FamilyRole {
  const text = `${name} ${description ?? ""}`.toLowerCase();
  if (AMBIGUOUS.some((w) => text.includes(w)) && !ADDITIONAL_HINTS.some((h) => text.includes(h))) return null;
  if (ADDITIONAL_HINTS.some((h) => text.includes(h))) return "additional";
  if (PRIMARY_HINTS.some((h) => text.includes(h))) return "primary";
  return null;
}

/** How many more people may still be linked to this package. */
export function remainingSlots(primary: FamilyCategory, activeCount: number): number | null {
  if (primary.family_max_additional == null) return null;
  return Math.max(0, primary.family_max_additional - activeCount);
}

export function isFamilyFull(primary: FamilyCategory, activeCount: number): boolean {
  const left = remainingSlots(primary, activeCount);
  return left !== null && left <= 0;
}

/** Relationship allowed by the club's package settings. */
export function relationshipAllowed(primary: FamilyCategory, relationship?: string | null): boolean {
  const allowed = primary.family_allowed_relationships ?? [];
  if (allowed.length === 0) return true;
  if (!relationship) return false;
  return allowed.includes(relationship);
}

/** Dependent age limit, where the club sets one. Only applies to children. */
export function dependentAgeAllowed(
  primary: FamilyCategory,
  relationship?: string | null,
  age?: number | null,
): boolean {
  if (primary.family_dependent_max_age == null) return true;
  if (relationship !== "child") return true;
  if (age == null) return true; // unknown age never blocks — admin can review
  return age <= primary.family_dependent_max_age;
}

/** One combined amount for the primary member plus the people they add. */
export function combinedFamilyTotal(primaryAmount: number, additionalAmount: number, additionalCount: number): number {
  return Math.round((primaryAmount + additionalAmount * Math.max(0, additionalCount)) * 100) / 100;
}

/** Pro-rated amount for someone added part-way through the season. */
export function proRatedAmount(annual: number, proRate: boolean, month: number): number {
  if (!proRate || annual <= 0) return annual;
  const monthsLeft = Math.max(1, 12 - month + 1);
  return Math.round((annual * monthsLeft) / 12 * 100) / 100;
}
