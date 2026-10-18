import { describe, it, expect } from "vitest";
import { applyMovement, bundleCosts, grossProfit, perContainer, perServing, purchaseCostPerUnit, specialCogs, weightedAverage, type RecipeCostItem } from "@/lib/bar-costing";

describe("weighted-average costing", () => {
  it("matches the spec example: 10 @ R15 + 20 @ R18 = R17", () => {
    expect(weightedAverage(10, 15, 20, 18)).toBeCloseTo(17, 10);
  });
  it("first purchase or empty shelf takes the purchase cost; never divides by zero", () => {
    expect(weightedAverage(0, null, 5, 12)).toBe(12);
    expect(weightedAverage(0, 99, 5, 12)).toBe(12);
    expect(weightedAverage(-3, 10, 5, 12)).toBe(12);
    expect(weightedAverage(4, 10, 0, 12)).toBe(10);
    expect(purchaseCostPerUnit(100, 0)).toBeNull();
  });

  it("snapshots sale cost; a later purchase never rewrites it", () => {
    let s = { avg_unit_cost: 15 as number | null, stock_units: 10 };
    const sale = applyMovement(s, -2, "sale", { costing: true });
    expect(sale.value).toBe(-30);
    s = sale.item;
    const buy = applyMovement(s, 8, "purchase", { costing: true, purchaseCostPerUnit: 20 });
    expect(buy.item.avg_unit_cost).toBeCloseTo((8 * 15 + 8 * 20) / 16, 10);
    expect(sale.value).toBe(-30); // historic snapshot unchanged
  });

  it("stocktake records variance at current cost without re-averaging", () => {
    const r = applyMovement({ avg_unit_cost: 11, stock_units: 1200 }, -5, "stocktake", { costing: true });
    expect(r.item.avg_unit_cost).toBe(11);
    expect(r.value).toBe(-55);
  });

  it("clamped ordinary sale costs what was consumed but stock stays at zero", () => {
    const r = applyMovement({ avg_unit_cost: 10, stock_units: 1 }, -3, "sale", { costing: true });
    expect(r.item.stock_units).toBe(0);
    expect(r.value).toBe(-30);
  });

  it("costing off: no cost recorded, no average changes (other clubs unchanged)", () => {
    const r = applyMovement({ avg_unit_cost: null, stock_units: 5 }, 10, "purchase", { costing: false, purchaseCostPerUnit: 3 });
    expect(r.item.avg_unit_cost).toBeNull();
    expect(r.value).toBeNull();
  });
});

describe("spirits, mixers and specials", () => {
  const item = (id: string, patch: Partial<RecipeCostItem> = {}): RecipeCostItem => ({ id, name: id, price: 20, category: "bar", stock_qty: 10, item_kind: "stock", unit_yield: 1, ...patch });
  it("calculates a bundle from latest component prices and averages separately", () => {
    const items = [item("beer", { cost_price: 10, avg_unit_cost: 9 }), item("snack", { cost_price: 6, avg_unit_cost: 5 })];
    const recipe = [{ component_item_id: "beer", quantity: 2 }, { component_item_id: "snack", quantity: 1 }];
    expect(bundleCosts(recipe, items)).toEqual({ current: 26, average: 23 });
    expect(bundleCosts(recipe, items.map(i => i.id === "beer" ? { ...i, cost_price: 12 } : i)).current).toBe(30);
  });
  it("uses option consumption for spirits and bulk mixers, not a full bottle", () => {
    const items = [item("bottle", { unit_yield: 30, cost_price: 300, avg_unit_cost: 11 }), item("double", { item_kind: "option", stock_parent_id: "bottle", consume_units: 2 }), item("mixer", { unit_yield: 1000, cost_price: 15, avg_unit_cost: 0.015 }), item("glass", { item_kind: "option", stock_parent_id: "mixer", consume_units: 250 })];
    expect(bundleCosts([{ component_item_id: "double", quantity: 2 }, { component_item_id: "glass", quantity: 2 }], items)).toEqual({ current: 47.5, average: 51.5 });
  });
  it("does not replace missing averages with current prices or show an incomplete bundle as zero", () => {
    expect(bundleCosts([{ component_item_id: "beer", quantity: 2 }], [item("beer", { cost_price: 10 })])).toEqual({ current: 20, average: null });
    expect(bundleCosts([{ component_item_id: "absent", quantity: 1 }], [])).toEqual({ current: null, average: null });
    expect(bundleCosts([], [])).toEqual({ current: null, average: null });
  });
  it("keeps genuine zero averages and flags default missing current prices", () => {
    expect(bundleCosts([{ component_item_id: "beer", quantity: 1 }], [item("beer", { cost_price: 0, avg_unit_cost: 0 })])).toEqual({ current: null, average: 0 });
  });
  it("bottle cost → per-tot cost with configurable yield, exact open bottle", () => {
    // 10 bottles @ R300 then 20 @ R360, 30 tots/bottle
    let avg = weightedAverage(0, null, 300, purchaseCostPerUnit(3000, 300)!);
    avg = weightedAverage(300, avg, 600, purchaseCostPerUnit(7200, 600)!);
    expect(perContainer(avg, 30)).toBeCloseTo(340, 8);
    expect(perServing(avg, 2)).toBeCloseTo(340 / 15, 8); // double
    const jam = purchaseCostPerUnit(280, 28)!; // R280 bottle, 28 tots
    expect(perServing(jam, 1)).toBeCloseTo(10, 10);
  });
  it("bulk mixer: litres bought at a cost → per-glass cost", () => {
    const perMl = purchaseCostPerUnit(30, 2000)!; // 2 L for R30
    expect(perServing(perMl, 250)).toBeCloseTo(3.75, 10);
  });
  it("special COGS = sum of recipe components (4 tots + 2 glasses)", () => {
    expect(specialCogs([{ units: 4, avgUnitCost: 11 }, { units: 500, avgUnitCost: 0.015 }])).toEqual({ cogs: 51.5, uncosted: false });
    expect(specialCogs([{ units: 4, avgUnitCost: 11 }, { units: 500, avgUnitCost: null }]).uncosted).toBe(true);
  });
  it("gross margin handles zero revenue", () => {
    expect(grossProfit(100, 40)).toEqual({ profit: 60, margin: 0.6 });
    expect(grossProfit(0, 5).margin).toBeNull();
  });
});
