import { computeBookingGate } from "@/lib/booking-balance-gate";

/**
 * Bar/Shop "Allow member account to go into debit" gate.
 * Reuses the court-booking formula exactly (allowance = unpaid fees covered by an
 * active monthly recurring arrangement), with no booking float, checked on the
 * balance AFTER the purchase. The backend trigger `bar_tab_enforce_member_debit`
 * is authoritative; this mirror is for UI and tests.
 */
export function computeAccountChargeGate(opts: {
  currentOwing: number; // positive = owes, negative = prepaid credit
  purchase: number;
  fees: { amount: number; fee_type?: string | null }[];
  hasMandate: boolean;
}) {
  const projectedOwing = opts.currentOwing + opts.purchase;
  const { planAllowedDebt, shortfall } = computeBookingGate({
    currentOwing: projectedOwing,
    fees: opts.fees,
    hasMandate: opts.hasMandate,
    buffer: 0,
  });
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    allowed: shortfall <= 0,
    projectedOwing: r2(projectedOwing),
    allowance: r2(planAllowedDebt),
    shortfall: shortfall > 0 ? r2(shortfall) : 0,
  };
}

/** Which switch governs an item: "shop" division → Shop, everything else → Bar. */
export function debitSwitchFor(division: string | null | undefined): "bar" | "shop" {
  return division === "shop" ? "shop" : "bar";
}

export type AccountLimitInfo = { shortfall: number; projectedOwing: number; allowance: number };

/** Parse the backend's `ACCOUNT_LIMIT|shortfall|projected|allowance` refusal. */
export function parseAccountLimit(err: unknown): AccountLimitInfo | null {
  const msg = String((err as any)?.message ?? err ?? "");
  const m = msg.match(/ACCOUNT_LIMIT\|(-?[\d.]+)\|(-?[\d.]+)\|(-?[\d.]+)/);
  if (!m) return null;
  return { shortfall: Number(m[1]), projectedOwing: Number(m[2]), allowance: Number(m[3]) };
}

const rand = (n: number) => `R${n.toFixed(2)}`;

/** Friendly message for any bar error; explains account-limit refusals. */
export function barChargeErrorMessage(err: unknown, fallback: string): string {
  const info = parseAccountLimit(err);
  if (!info) return (err as any)?.message || fallback;
  return `Not added to the member account: this would take the account to ${rand(info.projectedOwing)} owing, `
    + `beyond what it allows (${rand(info.allowance)}). Pay by card, or top up the account first `
    + `(${rand(info.shortfall)} short). Nothing was charged.`;
}

export const EARLY_ACCOUNT_WARNING =
  "Member account has insufficient available credit. Please pay by card or top up.";

/**
 * Early basket warning: given the club's switches and the member's current owing/allowance,
 * decide whether the current basket can go on the member account. Recalculated on every change.
 */
export function previewBasketCharge(opts: {
  preview: { bar_gated: boolean; shop_gated: boolean; current_owing: number; allowance: number } | null | undefined;
  lines: { division?: string | null; total: number }[];
}): { blocked: boolean; shortfall: number } {
  const { preview, lines } = opts;
  const total = lines.reduce((s, l) => s + Number(l.total || 0), 0);
  if (!preview) return { blocked: false, shortfall: 0 };
  // Available spendable credit = allowance - owing. With an empty basket, warn as soon as a
  // gated member is selected whose available credit is already zero or negative.
  if (total <= 0) {
    if (!preview.bar_gated && !preview.shop_gated) return { blocked: false, shortfall: 0 };
    const available = Number(preview.allowance || 0) - Number(preview.current_owing || 0);
    return available <= 0 ? { blocked: true, shortfall: Math.round(-available * 100) / 100 } : { blocked: false, shortfall: 0 };
  }
  const gated = lines.some((l) => Number(l.total) > 0
    && (debitSwitchFor(l.division) === "shop" ? preview.shop_gated : preview.bar_gated));
  if (!gated) return { blocked: false, shortfall: 0 };
  const allowance = Number(preview.allowance || 0);
  const r = computeAccountChargeGate({
    currentOwing: Number(preview.current_owing || 0),
    purchase: total,
    fees: allowance > 0 ? [{ amount: allowance }] : [],
    hasMandate: allowance > 0,
  });
  return { blocked: !r.allowed, shortfall: r.shortfall };
}
