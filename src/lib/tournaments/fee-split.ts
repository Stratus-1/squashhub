/**
 * Entry-fee split for the shared tournament platform.
 *
 * An entry fee is divided, in order:
 *   1. federation share (fixed cents, governance)
 *   2. association share (fixed cents, governance)
 *   3. host compensation for the venue the match was played at
 *      (fixed cents and/or a percentage of the entry fee)
 *   4. the remainder stays with the owning body
 */

export interface FeeSplitInput {
  entryFeeCents: number;
  federationFeeCents: number;
  associationFeeCents: number;
  /** Host compensation for the venue: fixed amount plus percentage of entry. */
  hostFeeCents?: number;
  hostSharePct?: number;
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
  owner: number;
  /** True when the configured shares exceed the entry fee. */
  overAllocated: boolean;
}

export function computeFeeSplit(input: FeeSplitInput): FeeSplit {
  const entry = Math.max(0, Math.round(input.entryFeeCents || 0));
  const federation = Math.max(0, Math.round(input.federationFeeCents || 0));
  const association = Math.max(0, Math.round(input.associationFeeCents || 0));
  const hostPct = Math.max(0, Math.min(100, input.hostSharePct || 0));
  const host = Math.max(0, Math.round((input.hostFeeCents || 0) + (entry * hostPct) / 100));
  const platformPct = Math.max(0, Math.min(100, input.platformFeePct || 0));
  const platform = Math.round((entry * platformPct) / 100);

  const allocated = platform + federation + association + host;
  return {
    entry,
    platform,
    federation,
    association,
    host,
    owner: Math.max(0, entry - allocated),
    overAllocated: allocated > entry,
  };
}


export const centsToRand = (cents: number) => (cents / 100).toFixed(2);
export const randToCents = (value: string) => Math.max(0, Math.round((parseFloat(value || "0") || 0) * 100));
