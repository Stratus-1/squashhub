/**
 * Tournament entry-fee basis — one calculation used by setup, summaries, posting previews and claims.
 * Mirrors DB `champ_registration_fee_lines`. A null basis means "Needs confirmation": no amounts, no charges.
 */
export type FeeBasis = "per_player" | "per_category";
export type MixedRule = "highest" | "first";

export type FeeSettings = {
  basis: FeeBasis | null;
  mixedRule: MixedRule | null;
  flatCents: number;
  /** Division number (1-based, as string) → fee in cents. */
  divisionFees?: Record<string, number> | null;
};

export type FeeEntrant = { memberId: string; divisions: number[] };

export const feesVary = (s: Pick<FeeSettings, "divisionFees">) =>
  new Set(Object.values(s.divisionFees ?? {}).map(Number)).size > 1;

/** Why the basis cannot be applied yet, or null when amounts can be computed. */
export function basisProblem(s: FeeSettings): string | null {
  if (!s.basis) return "Needs confirmation: choose how the entry fee is charged in Tournament Setup → Fees & Payment.";
  if (s.basis === "per_player" && feesVary(s) && !s.mixedRule)
    return "Categories have different fees: choose which fee applies to a player in several categories.";
  return null;
}

const divFee = (s: FeeSettings, d: number) => {
  const v = s.divisionFees?.[String(d)];
  return v == null ? s.flatCents : Number(v);
};

/** Amount owed by one entrant in cents, or null when the basis is not usable. */
export function entrantFeeCents(s: FeeSettings, e: FeeEntrant): number | null {
  if (basisProblem(s)) return null;
  const divs = e.divisions.length ? e.divisions : [];
  if (s.basis === "per_category") return divs.reduce((t, d) => t + divFee(s, d), 0);
  if (!feesVary(s)) {
    const vals = Object.values(s.divisionFees ?? {});
    return vals.length ? Math.max(...vals.map(Number)) : s.flatCents;
  }
  if (!divs.length) return s.flatCents;
  return s.mixedRule === "highest" ? Math.max(...divs.map((d) => divFee(s, d))) : divFee(s, divs[0]);
}

export type FeeTotals = { uniquePlayers: number; categoryEntries: number; totalCents: number | null };

export function feeTotals(s: FeeSettings, entrants: FeeEntrant[]): FeeTotals {
  const byMember = new Map<string, Set<number>>();
  for (const e of entrants) {
    const set = byMember.get(e.memberId) ?? new Set<number>();
    e.divisions.forEach((d) => set.add(d));
    byMember.set(e.memberId, set);
  }
  const people = [...byMember.entries()].map(([memberId, d]) => ({ memberId, divisions: [...d] }));
  const categoryEntries = people.reduce((t, p) => t + p.divisions.length, 0);
  const amounts = people.map((p) => entrantFeeCents(s, p));
  const totalCents = amounts.some((a) => a == null) ? null : (amounts as number[]).reduce((t, a) => t + a, 0);
  return { uniquePlayers: people.length, categoryEntries, totalCents };
}

/** Split a verified payment over members' unpaid charges; anything left over stays as account credit. */
export function allocatePayment(paidCents: number, dues: Array<{ memberId: string; dueCents: number }>) {
  let left = Math.max(0, Math.round(paidCents));
  const lines = dues.map((d) => {
    const applied = Math.min(left, Math.max(0, d.dueCents));
    left -= applied;
    return { memberId: d.memberId, appliedCents: applied, stillDueCents: d.dueCents - applied };
  });
  return { lines, creditCents: left };
}

export const rand = (cents: number | null | undefined) =>
  cents == null ? "—" : `R${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
