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

export type SaasCycle = "monthly" | "biannual" | "annual";
export type SaasCurrency = "ZAR" | "USD" | "EUR";

/** Number of months covered by one invoice of each cycle. */
export const CYCLE_MONTHS: Record<SaasCycle, number> = { monthly: 1, biannual: 6, annual: 12 };

/** Prepayment discount off the monthly rate, applied when seeding defaults. */
export const CYCLE_DISCOUNT: Record<SaasCycle, number> = { monthly: 0, biannual: 0.05, annual: 0.1 };

export const CYCLE_LABEL: Record<SaasCycle, string> = {
  monthly: "Monthly",
  biannual: "6-monthly (5% off)",
  annual: "Annual (10% off)",
};

/** Band widths are identical across currencies — only the rates differ. */
export const DEFAULT_TIERS: Record<SaasCurrency, Record<SaasCycle, SaasTier[]>> = {
  ZAR: {
    monthly: [
      { upTo: 50, rate: 6.0 },
      { upTo: 150, rate: 5.0 },
      { upTo: 250, rate: 4.0 },
      { upTo: 500, rate: 3.0 },
      { upTo: null, rate: 2.5 },
    ],
    biannual: [
      { upTo: 50, rate: 5.7 },
      { upTo: 150, rate: 4.75 },
      { upTo: 250, rate: 3.8 },
      { upTo: 500, rate: 2.85 },
      { upTo: null, rate: 2.38 },
    ],
    annual: [
      { upTo: 50, rate: 5.4 },
      { upTo: 150, rate: 4.5 },
      { upTo: 250, rate: 3.6 },
      { upTo: 500, rate: 2.7 },
      { upTo: null, rate: 2.25 },
    ],
  },
  USD: {
    monthly: [
      { upTo: 50, rate: 0.35 },
      { upTo: 150, rate: 0.29 },
      { upTo: 250, rate: 0.23 },
      { upTo: 500, rate: 0.18 },
      { upTo: null, rate: 0.15 },
    ],
    biannual: [
      { upTo: 50, rate: 0.33 },
      { upTo: 150, rate: 0.28 },
      { upTo: 250, rate: 0.22 },
      { upTo: 500, rate: 0.17 },
      { upTo: null, rate: 0.14 },
    ],
    annual: [
      { upTo: 50, rate: 0.32 },
      { upTo: 150, rate: 0.26 },
      { upTo: 250, rate: 0.21 },
      { upTo: 500, rate: 0.16 },
      { upTo: null, rate: 0.14 },
    ],
  },
  EUR: {
    monthly: [
      { upTo: 50, rate: 0.32 },
      { upTo: 150, rate: 0.27 },
      { upTo: 250, rate: 0.21 },
      { upTo: 500, rate: 0.16 },
      { upTo: null, rate: 0.13 },
    ],
    biannual: [
      { upTo: 50, rate: 0.3 },
      { upTo: 150, rate: 0.26 },
      { upTo: 250, rate: 0.2 },
      { upTo: 500, rate: 0.15 },
      { upTo: null, rate: 0.12 },
    ],
    annual: [
      { upTo: 50, rate: 0.29 },
      { upTo: 150, rate: 0.24 },
      { upTo: 250, rate: 0.19 },
      { upTo: 500, rate: 0.14 },
      { upTo: null, rate: 0.12 },
    ],
  },
};

/** Minimum monthly charge per currency (protects revenue on very small clubs). */
export const DEFAULT_MIN_CHARGE: Record<SaasCurrency, Record<SaasCycle, number>> = {
  ZAR: { monthly: 120, biannual: 114, annual: 108 },
  USD: { monthly: 14.6, biannual: 13.87, annual: 13.14 },
  EUR: { monthly: 13.35, biannual: 12.68, annual: 12.02 },
};

export const SAAS_CYCLES: SaasCycle[] = ["monthly", "biannual", "annual"];


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
