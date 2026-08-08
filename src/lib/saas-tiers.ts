/**
 * Graduated ("sliding scale") SaaS pricing.
 *
 * Members are billed like tax brackets: the first N members cost the band-1
 * rate, the next block the band-2 rate, and so on. This gives large clubs
 * volume relief while keeping small clubs viable via a minimum charge.
 *
 * ZAR is the base currency. USD/EUR bands are the ZAR bands scaled by the same
 * ratio that already exists between the flat per-member rates, so international
 * pricing stays proportional to the local structure.
 */

export type SaasTier = {
  /** Upper bound of this band (inclusive), or null for "and above". */
  upTo: number | null;
  /** Rate per member per month within this band. */
  rate: number;
};

export type SaasCycle = "monthly" | "annual";
export type SaasCurrency = "ZAR" | "USD" | "EUR";

/** Band widths are identical across currencies — only the rates differ. */
export const DEFAULT_TIERS: Record<SaasCurrency, Record<SaasCycle, SaasTier[]>> = {
  ZAR: {
    monthly: [
      { upTo: 50, rate: 8.0 },
      { upTo: 100, rate: 5.0 },
      { upTo: 200, rate: 3.0 },
      { upTo: 400, rate: 2.5 },
      { upTo: null, rate: 2.0 },
    ],
    annual: [
      { upTo: 50, rate: 6.7 },
      { upTo: 100, rate: 4.2 },
      { upTo: 200, rate: 2.5 },
      { upTo: 400, rate: 2.1 },
      { upTo: null, rate: 1.7 },
    ],
  },
  // ZAR × 0.0583 (matches the existing R6.00 → $0.35 flat-rate ratio)
  USD: {
    monthly: [
      { upTo: 50, rate: 0.47 },
      { upTo: 100, rate: 0.29 },
      { upTo: 200, rate: 0.18 },
      { upTo: 400, rate: 0.15 },
      { upTo: null, rate: 0.12 },
    ],
    annual: [
      { upTo: 50, rate: 0.4 },
      { upTo: 100, rate: 0.25 },
      { upTo: 200, rate: 0.15 },
      { upTo: 400, rate: 0.13 },
      { upTo: null, rate: 0.1 },
    ],
  },
  // ZAR × 0.0533 (matches the existing R6.00 → €0.32 flat-rate ratio)
  EUR: {
    monthly: [
      { upTo: 50, rate: 0.43 },
      { upTo: 100, rate: 0.27 },
      { upTo: 200, rate: 0.16 },
      { upTo: 400, rate: 0.13 },
      { upTo: null, rate: 0.11 },
    ],
    annual: [
      { upTo: 50, rate: 0.36 },
      { upTo: 100, rate: 0.23 },
      { upTo: 200, rate: 0.14 },
      { upTo: 400, rate: 0.11 },
      { upTo: null, rate: 0.09 },
    ],
  },
};

/** Minimum monthly charge per currency (protects revenue on very small clubs). */
export const DEFAULT_MIN_CHARGE: Record<SaasCurrency, Record<SaasCycle, number>> = {
  ZAR: { monthly: 250, annual: 210 },
  USD: { monthly: 14.6, annual: 12.5 },
  EUR: { monthly: 13.35, annual: 11.2 },
};

export const tierSettingKey = (ccy: string, cycle: SaasCycle) =>
  `saas_tiers_${String(ccy || "ZAR").toLowerCase()}_${cycle}`;

export const TIERS_ENABLED_KEY = "saas_tiers_enabled";

export function normaliseCurrency(ccy?: string | null): SaasCurrency {
  const c = String(ccy || "ZAR").toUpperCase();
  return c === "USD" || c === "EUR" ? c : "ZAR";
}

export function parseTiers(raw?: string | null): SaasTier[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr
      .map((t: any) => ({
        upTo: t.upTo == null || t.upTo === "" ? null : Number(t.upTo),
        rate: Number(t.rate) || 0,
      }))
      .filter((t) => t.upTo === null || (isFinite(t.upTo) && t.upTo > 0));
  } catch {
    return null;
  }
}

export type TierBreakdownRow = {
  from: number;
  to: number;
  members: number;
  rate: number;
  amount: number;
};

/** Graduated total for `members`, before the minimum charge is applied. */
export function tierBreakdown(members: number, tiers: SaasTier[]): TierBreakdownRow[] {
  const rows: TierBreakdownRow[] = [];
  let remaining = Math.max(0, Math.floor(members || 0));
  let lower = 0;
  for (const t of tiers) {
    if (remaining <= 0) break;
    const width = t.upTo == null ? remaining : Math.max(0, t.upTo - lower);
    const take = Math.min(remaining, width);
    if (take > 0) {
      rows.push({
        from: lower + 1,
        to: lower + take,
        members: take,
        rate: t.rate,
        amount: +(take * t.rate).toFixed(2),
      });
    }
    remaining -= take;
    lower = t.upTo == null ? lower + take : t.upTo;
  }
  return rows;
}

export function computeTieredCharge(
  members: number,
  tiers: SaasTier[],
  minimumCharge = 0,
): { subtotal: number; gross: number; minApplied: boolean; rows: TierBreakdownRow[]; effectiveRate: number } {
  const rows = tierBreakdown(members, tiers);
  const gross = +rows.reduce((s, r) => s + r.amount, 0).toFixed(2);
  const subtotal = +Math.max(gross, minimumCharge || 0).toFixed(2);
  return {
    gross,
    subtotal,
    minApplied: subtotal > gross,
    rows,
    effectiveRate: members > 0 ? +(subtotal / members).toFixed(2) : 0,
  };
}
