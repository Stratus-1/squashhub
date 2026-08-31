import { PERMISSION_SLUGS } from "@/hooks/use-club-permissions";

/**
 * Permission slugs that only make sense for a club tenant.
 * Associations have no courts, bar, door access, ladder or visitor register,
 * so offering these to an association admin is noise (and misleading).
 */
export const CLUB_ONLY_SLUGS = [
  "courts",
  "bar",
  "access",
  "devices",
  "ladder",
  "visitors",
  "bookings_unlimited",
  "bookings_unlimited_non_peak",
  "ops_booking",
] as const;

/** Association-specific wording for slugs whose club label is club-centric. */
export const ASSOCIATION_LABEL_OVERRIDES: Record<string, string> = {
  club: "Association Info",
  members: "Members (affiliated players)",
  users: "Users & Admins",
  fees: "Fees (receivable & payable)",
  leagues: "Leagues & Teams",
  champs: "Tournaments",
  affiliation: "Affiliated Clubs",
};

export interface ScopedSlug {
  value: string;
  label: string;
}

/**
 * Filter + relabel the permission slug list for the tenant currently being
 * administered. Clubs keep the full list unchanged.
 */
export function permissionSlugsForTenant(isAssociation: boolean): ScopedSlug[] {
  return PERMISSION_SLUGS.filter(
    (s) => !isAssociation || !(CLUB_ONLY_SLUGS as readonly string[]).includes(s.value),
  ).map((s) => ({
    value: s.value,
    label: (isAssociation && ASSOCIATION_LABEL_OVERRIDES[s.value]) || s.label,
  }));
}

/** Human label for a stored slug, respecting association wording. */
export function permissionLabel(slug: string, isAssociation: boolean): string {
  if (isAssociation && ASSOCIATION_LABEL_OVERRIDES[slug]) return ASSOCIATION_LABEL_OVERRIDES[slug];
  return PERMISSION_SLUGS.find((s) => s.value === slug)?.label || slug;
}

/** Hide stored club-only slugs when displaying an association tenant's grants. */
export function visibleSlugs(slugs: string[] | null | undefined, isAssociation: boolean): string[] {
  const list = slugs ?? [];
  if (!isAssociation) return list;
  return list.filter((s) => !(CLUB_ONLY_SLUGS as readonly string[]).includes(s));
}
