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
