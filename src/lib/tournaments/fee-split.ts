/**
 * Ownership-aware entry-fee allocation for the shared tournament platform.
 *
 * The OWNER of a tournament (club, association or federation) is the residual
 * beneficiary. Gross entry revenue is reduced, in order, by:
 *   1. the SquashHub platform/admin fee (percentage of entry)
 *   2. a federation levy — only when the federation is NOT the owner
 *   3. an association levy — only for club-owned events
 *   4. host / venue compensation (fixed and/or percentage of entry)
 *   5. other explicitly configured expenses
 * whatever is left belongs to the owner.
 *
 * A levy is never charged back to the body that owns the event, so an
 * association-owned event has no "association share" and a Squash SA-owned
 * event has neither a federation nor an association levy.
 *
 * This mirrors public.tournament_fee_allocation() in the database, which is the
 * source of truth for reporting and payouts.
 */

/** Organisation kinds as stored in `organisations.kind`. */
export type OwnerKind = "club" | "association" | "national";

export interface FeeSplitInput {
  entryFeeCents: number;
  /** Kind of the owning organisation. Legacy/unassigned tournaments fall back to "club". */
  ownerKind?: OwnerKind | null;
  /** Federation levy: fixed amount and/or percentage of the entry fee. */
  federationFeeCents?: number;
  federationFeePct?: number;
  /** Association levy: fixed amount and/or percentage of the entry fee. */
  associationFeeCents?: number;
  associationFeePct?: number;
  /** Host compensation for the venue: fixed amount plus percentage of entry. */
  hostFeeCents?: number;
  hostSharePct?: number;
  /** Other explicit expenses charged against the event (fixed amount). */
  otherExpensesCents?: number;
  /** SquashHub platform admin fee, as a percentage of the entry fee. */
  platformFeePct?: number;
}

export interface FeeSplit {
  entry: number;
  /** SquashHub admin fee taken off the top. */
  platform: number;
  federation: number;
  association: number;
  host: number;
  other: number;
  /** Residual retained by the owning entity. */
  owner: number;
  /** Whether each levy is chargeable given who owns the event. */
  federationApplies: boolean;
  associationApplies: boolean;
  /** True when the configured deductions exceed the entry fee. */
  overAllocated: boolean;
}

const clampPct = (v: number | undefined) => Math.max(0, Math.min(100, Number(v) || 0));
const nonNeg = (v: number | undefined) => Math.max(0, Math.round(Number(v) || 0));

/** Federation levies make no sense when the federation itself owns the event. */
export function federationLevyApplies(ownerKind?: OwnerKind | null) {
  return (ownerKind ?? "club") !== "national";
}

/** Association levies only apply to club-owned events. */
export function associationLevyApplies(ownerKind?: OwnerKind | null) {
  return (ownerKind ?? "club") === "club";
}

export function computeFeeSplit(input: FeeSplitInput): FeeSplit {
  const entry = nonNeg(input.entryFeeCents);
  const ownerKind = input.ownerKind ?? "club";

  const platform = Math.round((entry * clampPct(input.platformFeePct)) / 100);

  const federationApplies = federationLevyApplies(ownerKind);
  const federation = federationApplies
    ? nonNeg(input.federationFeeCents) + Math.round((entry * clampPct(input.federationFeePct)) / 100)
    : 0;

  const associationApplies = associationLevyApplies(ownerKind);
  const association = associationApplies
    ? nonNeg(input.associationFeeCents) + Math.round((entry * clampPct(input.associationFeePct)) / 100)
    : 0;

  const host = nonNeg(input.hostFeeCents) + Math.round((entry * clampPct(input.hostSharePct)) / 100);
  const other = nonNeg(input.otherExpensesCents);

  const allocated = platform + federation + association + host + other;
  return {
    entry,
    platform,
    federation,
    association,
    host,
    other,
    owner: Math.max(0, entry - allocated),
    federationApplies,
    associationApplies,
    overAllocated: allocated > entry,
  };
}

/** Human label for an owning entity, e.g. "Nelspruit Squash Club (Club)". */
export function ownerLabel(name?: string | null, kind?: OwnerKind | null) {
  const kindLabel = kind === "national" ? "Federation" : kind === "association" ? "Association" : "Club";
  return name ? `${name} (${kindLabel})` : `the owning ${kindLabel.toLowerCase()}`;
}

export const centsToRand = (cents: number) => ((Number(cents) || 0) / 100).toFixed(2);
export const randToCents = (value: string) => Math.max(0, Math.round((parseFloat(value || "0") || 0) * 100));
