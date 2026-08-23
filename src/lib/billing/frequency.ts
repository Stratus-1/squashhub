/**
 * Canonical billing-frequency mapping.
 *
 * There is exactly ONE authoritative persisted field: `clubs.sla_billing_option`.
 * It is edited only by the "Billing frequency" control below the SLA agreement.
 * Everything else (SLA card, plan summary, invoice scheduler, subscription
 * baseline) is a read-only reflection of this value.
 */

/** Persisted canonical values on clubs.sla_billing_option. */
export type BillingOption = "monthly" | "biannual_upfront" | "annual_upfront";

/** Invoice-cycle values used by invoices / baselines / the billing cron. */
export type BillingCycle = "monthly" | "biannual" | "annual";

export const BILLING_OPTIONS: BillingOption[] = ["monthly", "biannual_upfront", "annual_upfront"];

/** Normalises anything (legacy, null, "1 month", "six_monthly") to a canonical option. */
export function normalizeBillingOption(value: unknown): BillingOption {
  const v = String(value ?? "").trim().toLowerCase();
  if (["annual_upfront", "annual", "annually", "yearly", "12 months", "12_months"].includes(v)) {
    return "annual_upfront";
  }
  if (
    [
      "biannual_upfront",
      "biannual",
      "bi_annual",
      "six_monthly",
      "six-monthly",
      "6_monthly",
      "6-monthly",
      "semiannual",
      "6 months",
    ].includes(v)
  ) {
    return "biannual_upfront";
  }
  return "monthly";
}

/** Canonical option -> invoice cycle. */
export function optionToCycle(option: unknown): BillingCycle {
  const o = normalizeBillingOption(option);
  return o === "annual_upfront" ? "annual" : o === "biannual_upfront" ? "biannual" : "monthly";
}

/** Invoice cycle -> canonical option. */
export function cycleToOption(cycle: unknown): BillingOption {
  return normalizeBillingOption(cycle);
}

/** Number of months each invoice covers. */
export function monthsPerInvoice(option: unknown): number {
  const c = optionToCycle(option);
  return c === "annual" ? 12 : c === "biannual" ? 6 : 1;
}

/** Human label used everywhere the frequency is displayed. */
export function billingOptionLabel(option: unknown): string {
  const o = normalizeBillingOption(option);
  return o === "annual_upfront"
    ? "Annual upfront"
    : o === "biannual_upfront"
      ? "6-monthly upfront"
      : "Monthly";
}

/** Copy used in fee-structure / invoice wording. */
export function invoicedInAdvanceLabel(option: unknown): string {
  const o = normalizeBillingOption(option);
  return o === "annual_upfront"
    ? "annually in advance"
    : o === "biannual_upfront"
      ? "six-monthly in advance"
      : "monthly in advance";
}

/**
 * Next invoice date after `from`, driven only by the canonical option.
 * UTC-safe (no local timezone drift), clamps to end-of-month.
 */
export function nextInvoiceDate(from: Date | string, option: unknown): Date {
  const d = typeof from === "string" ? new Date(`${from.slice(0, 10)}T00:00:00Z`) : from;
  const months = monthsPerInvoice(option);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}
