/**
 * Fees the club pays onward (associations, national bodies), per season.
 * Rates an association or national body set for a season replace the club's own
 * manual row for the same body and basis, so they are never counted twice.
 */
export type PayableBasis = "per_member" | "per_team" | "per_club";

export interface ManualPayable {
  id: string;
  payee_type: "league_association" | "national_body";
  payee_name: string;
  payee_ref_id: string | null;
  basis: PayableBasis;
  season_year: number;
}
export interface AssociationRate { association_tenant_id: string; basis: string }
export interface NationalRate { organisation_name: string; basis: string }
export interface AssociationLink { id: string; tenant_association_id: string | null }
export interface NationalBodyLink { league_association_id: string; national_body_fee_id: string }

const ASSOC_BASIS: Record<PayableBasis, string> = { per_member: "member", per_team: "league_team", per_club: "club" };

export function payableFeeTenant(
  f: ManualPayable,
  associations: AssociationLink[],
  nbLinks: NationalBodyLink[],
): string | null {
  if (!f.payee_ref_id) return null;
  if (f.payee_type === "league_association") {
    return associations.find((a) => a.id === f.payee_ref_id)?.tenant_association_id ?? null;
  }
  const link = nbLinks.find((l) => l.national_body_fee_id === f.payee_ref_id);
  return link ? associations.find((a) => a.id === link.league_association_id)?.tenant_association_id ?? null : null;
}

/** Manual rows already covered by a rate the association or national body set for the season. */
export function coveredPayableIds(
  fees: ManualPayable[],
  associationRates: AssociationRate[],
  nationalRates: NationalRate[],
  associations: AssociationLink[],
  nbLinks: NationalBodyLink[],
): Set<string> {
  const set = new Set<string>();
  fees.forEach((f) => {
    const t = payableFeeTenant(f, associations, nbLinks);
    if (t && associationRates.some((r) => r.association_tenant_id === t && r.basis === ASSOC_BASIS[f.basis])) set.add(f.id);
    if (f.payee_type === "national_body") {
      const name = f.payee_name.toLowerCase();
      if (nationalRates.some((r) => r.basis === f.basis && name.startsWith(r.organisation_name.toLowerCase()))) set.add(f.id);
    }
  });
  return set;
}

/** Seasons to offer: next year down to three years back, plus any season that has rows. */
export function payableSeasons(thisYear: number, rowSeasons: number[]): number[] {
  const set = new Set<number>(rowSeasons);
  for (let y = thisYear + 1; y >= thisYear - 3; y--) set.add(y);
  return [...set].sort((a, b) => b - a);
}

/** Past seasons are a read-only record. */
export const isPayableSeasonLocked = (season: number, thisYear: number) => season < thisYear;
