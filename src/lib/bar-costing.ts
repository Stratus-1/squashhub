/**
 * Optional weighted-average stock costing (mirrors the database rules in
 * `bar_stock_apply` / `journal_bar_purchase` / `bar_set_average_cost`).
 *
 * Costs are held per smallest stock unit (tot, ml, or unit) so bottle/open-bottle
 * and litre/serving arithmetic stays exact. Bottle cost = unit cost × unit_yield.
 * Only purchases re-average; sales, specials and stocktakes snapshot the current
 * average and never change it. Historic movements are never rewritten.
 */

export type MovementReason = "purchase" | "sale" | "special_sale" | "stocktake" | "manual" | "cost_adjustment" | string;

/** Weighted average per smallest unit after receiving stock. Never divides by zero. */
export function weightedAverage(
  onHandUnits: number, currentAvg: number | null | undefined,
  receivedUnits: number, purchaseCostPerUnit: number,
): number | null {
  if (!(receivedUnits > 0) || !(purchaseCostPerUnit >= 0)) return currentAvg ?? null;
  const onHand = Math.max(onHandUnits, 0);
  if (currentAvg == null || onHand === 0) return purchaseCostPerUnit;
  return (onHand * currentAvg + receivedUnits * purchaseCostPerUnit) / (onHand + receivedUnits);
}

/** Cost per smallest unit for a purchase line (total ÷ units received). */
export function purchaseCostPerUnit(totalCost: number | null | undefined, unitsReceived: number): number | null {
  if (!(unitsReceived > 0) || totalCost == null || !(totalCost > 0)) return null;
  return totalCost / unitsReceived;
}

export const perContainer = (unitCost: number | null | undefined, unitYield = 1) =>
  unitCost == null ? null : unitCost * Math.max(unitYield, 1);

export const perServing = (unitCost: number | null | undefined, unitsPerServing: number) =>
  unitCost == null ? null : unitCost * unitsPerServing;

export interface CostItem { avg_unit_cost: number | null; stock_units: number }

/** Applies one movement the way the database does; returns the new state and the snapshot. */
export function applyMovement(
  item: CostItem, delta: number, reason: MovementReason,
  opts: { costing: boolean; purchaseCostPerUnit?: number | null; clamp?: boolean } ,
) {
  const clamp = opts.clamp ?? true;
  let after = item.stock_units + delta;
  if (clamp) after = Math.max(after, 0);
  if (after < 0) throw new Error("Not enough stock");
  let avg = item.avg_unit_cost;
  let unitCost: number | null = null;
  let value: number | null = null;
  if (opts.costing) {
    if (reason === "purchase" && opts.purchaseCostPerUnit != null && opts.purchaseCostPerUnit >= 0 && delta > 0) {
      avg = weightedAverage(item.stock_units, item.avg_unit_cost, delta, opts.purchaseCostPerUnit);
      unitCost = opts.purchaseCostPerUnit;
      value = round4(delta * opts.purchaseCostPerUnit);
    } else if (item.avg_unit_cost != null) {
      unitCost = item.avg_unit_cost;
      const consumed = reason === "sale" || reason === "special_sale" ? delta : after - item.stock_units;
      value = round4(consumed * item.avg_unit_cost);
    }
  }
  return { item: { avg_unit_cost: avg, stock_units: after }, unitCost, value };
}

/** COGS of a special = sum of its recipe components at their current averages. */
export function specialCogs(components: { units: number; avgUnitCost: number | null }[]): { cogs: number; uncosted: boolean } {
  let cogs = 0; let uncosted = false;
  for (const c of components) {
    if (c.avgUnitCost == null) { uncosted = true; continue; }
    cogs += c.units * c.avgUnitCost;
  }
  return { cogs: round4(cogs), uncosted };
}

export function grossProfit(revenue: number, cogs: number) {
  const profit = revenue - cogs;
  return { profit, margin: revenue > 0 ? profit / revenue : null };
}

export const REASON_LABELS: Record<string, string> = {
  purchase: "Purchase / receipt", sale: "Sale", special_sale: "Special (component)",
  stocktake: "Stocktake variance", manual: "Manual adjustment", cost_adjustment: "Cost adjustment",
};

const round4 = (n: number) => Math.round(n * 10000) / 10000;
