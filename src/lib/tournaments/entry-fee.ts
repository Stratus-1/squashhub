/**
 * Tournament entry fee is charged PER EVENT: event fee x the events a player pays for themselves.
 * Mirrors DB `champ_reg_own_due_cents` (events with no choice = 1 legacy entry; events a partner covers are excluded).
 */
export function eventCount(divisionChoices: unknown): number {
  const n = Array.isArray(divisionChoices) ? new Set(divisionChoices.map(Number).filter((x) => Number.isFinite(x))).size : 0;
  return Math.max(1, n);
}

export function ownEvents(divisionChoices: unknown, coveredGroups: Array<number | string> = []): number {
  const groups = Array.isArray(divisionChoices) && divisionChoices.length ? Array.from(new Set(divisionChoices.map(Number))) : [0];
  const covered = new Set(coveredGroups.map(Number));
  return groups.filter((g) => !covered.has(g)).length;
}

/**
 * Package prices by number of categories (tournaments.entry_fee_tiers, basis "tiered"): "1" → cents, "2" → cents …
 * Entering more categories than the last row pays the last row's price. Mirrors DB `champ_tier_fee_cents`.
 */
export type FeeTiers = Record<string, number>;

export function tierFeeCents(tiers: FeeTiers | null | undefined, count: number): number | null {
  if (!tiers) return null;
  const keys = Object.keys(tiers).filter((k) => /^\d+$/.test(k)).map(Number);
  if (!keys.length) return null;
  if (count <= 0) return 0;
  const n = Math.max(...keys);
  return Math.max(0, Math.round(Number(tiers[String(Math.min(count, n))]) || 0));
}

/** "1 category R200 · 2 categories R300 · 3 or more R350". */
export function tierSummary(tiers: FeeTiers, money: (cents: number) => string): string {
  const keys = Object.keys(tiers).filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
  return keys.map((k, i) => `${i === keys.length - 1 && keys.length > 1 ? `${k} or more` : `${k} categor${k === 1 ? "y" : "ies"}`} ${money(Number(tiers[String(k)]) || 0)}`).join(" · ");
}

export function entryDueCents(eventFeeCents: number, divisionChoices: unknown, coveredGroups: Array<number | string> = [], tiers?: FeeTiers | null): number {
  const n = ownEvents(divisionChoices, coveredGroups);
  const tier = tierFeeCents(tiers, n);
  if (tier != null) return tier;
  return Math.max(0, Math.round(Number(eventFeeCents) || 0)) * n;
}

/** "2 events x R150.00 = R300.00", or just "R150.00" for one event; package prices: "2 categories: R300.00". */
export function feeBreakdownLabel(eventFeeCents: number, events: number, money: (cents: number) => string, tiers?: FeeTiers | null): string {
  const tier = tierFeeCents(tiers, events);
  if (tier != null) return events <= 1 ? money(tier) : `${events} categories: ${money(tier)}`;
  if (events <= 1) return money(eventFeeCents);
  return `${events} events × ${money(eventFeeCents)} = ${money(eventFeeCents * events)}`;
}
