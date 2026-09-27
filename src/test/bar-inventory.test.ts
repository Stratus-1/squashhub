import { describe, it, expect } from "vitest";
import {
  formatStock, groupForPos, litresToUnits, servingMlFromPerLitre, servingsAvailable, totsToStockUnits, wholeEquivalent, isValidNow, onMenu, specialAvailable, splitUnits, stockRequirement, unitsPerSale,
  type InventoryItem, type SpecialComponent,
} from "@/lib/bar-inventory";
import { allCategories, categoriesForDivision, resolveDivisions } from "@/lib/bar-categories";

const base = (o: Partial<InventoryItem>): InventoryItem => ({ id: "x", name: "x", price: 1, category: "c", stock_qty: 0, ...o });
const brandy = base({ id: "b", name: "Klipdrift 750ml", unit_yield: 30, stock_units: 320, stock_qty: 10, sellable: false });
const jam = base({ id: "j", name: "Jameson", unit_yield: 28, stock_units: 110, stock_qty: 3 });
const single = base({ id: "s", item_kind: "option", stock_parent_id: "b", consume_units: 1, variant_label: "Single", stock_qty: 320 });
const double = base({ id: "d", item_kind: "option", stock_parent_id: "b", consume_units: 2, variant_label: "Double", stock_qty: 160 });
const buddy = base({ id: "bu", name: "Buddy", stock_units: 24, stock_qty: 24 });
const hansa = base({ id: "h", name: "Hansa", stock_units: 13, stock_qty: 13 });
const fri = base({ id: "f", item_kind: "special", stock_qty: 1 });
const six = base({ id: "six", item_kind: "special", stock_qty: 1 });
const comps: SpecialComponent[] = [
  { special_item_id: "f", component_item_id: "d", quantity: 2 },
  { special_item_id: "f", component_item_id: "bu", quantity: 1 },
  { special_item_id: "six", component_item_id: "h", quantity: 6 },
];
const all = [brandy, jam, single, double, buddy, hansa, fri, six];
const byId = new Map(all.map(i => [i.id, i]));

describe("bottle-to-tot stock", () => {
  it("single uses 1 tot, double 2, bottle a full yield", () => {
    expect(unitsPerSale(single)).toBe(1);
    expect(unitsPerSale(double)).toBe(2);
    expect(unitsPerSale(brandy)).toBe(30);
    expect(unitsPerSale(buddy)).toBe(1);
  });
  it("shows full bottles plus the open bottle", () => {
    expect(formatStock(brandy)).toBe("10.67 bottles (10 + 20/30 tots)");
    expect(splitUnits(283, 30)).toEqual({ whole: 9, open: 13 });
    expect(formatStock(jam)).toBe("3.93 bottles (3 + 26/28 tots)"); // configurable yield 28
    expect(formatStock(buddy)).toBe("24");
  });
});

describe("specials", () => {
  it("deduct components from the underlying stock", () => {
    const need = stockRequirement(fri, 1, byId, comps);
    expect(need.get("b")).toBe(4);
    expect(need.get("bu")).toBe(1);
    expect(stockRequirement(six, 1, byId, comps).get("h")).toBe(6);
  });
  it("availability is limited by the scarcest component", () => {
    expect(specialAvailable("f", byId, comps)).toBe(24);
    expect(specialAvailable("six", byId, comps)).toBe(2);
    const empty = new Map(byId); empty.set("bu", { ...buddy, stock_units: 0 });
    expect(specialAvailable("f", empty, comps)).toBe(0);
  });
  it("respects dates, weekdays and times (SA time)", () => {
    const friday = new Date("2026-10-02T17:30:00Z"); // Fri 19:30 SAST
    const saturday = new Date("2026-10-03T17:30:00Z");
    const s = base({ item_kind: "special", valid_days: [5], valid_start_time: "17:00", valid_end_time: "23:59", stock_qty: 5 });
    expect(isValidNow(s, friday)).toBe(true);
    expect(isValidNow(s, saturday)).toBe(false);
    const dated = base({ item_kind: "special", valid_from: "2026-10-01", valid_to: "2026-12-31", stock_qty: 5 });
    expect(isValidNow(dated, new Date("2026-09-27T10:00:00Z"))).toBe(false);
    expect(isValidNow(dated, new Date("2026-11-01T10:00:00Z"))).toBe(true);
    const overnight = base({ item_kind: "special", valid_start_time: "20:00", valid_end_time: "02:00" });
    expect(isValidNow(overnight, new Date("2026-10-02T23:00:00Z"))).toBe(true); // 01:00 SAST
    expect(isValidNow(overnight, new Date("2026-10-02T10:00:00Z"))).toBe(false);
    expect(onMenu({ ...s, stock_qty: 5 }, saturday)).toBe(false);
  });
});

describe("POS grouping", () => {
  it("puts Single/Double under one spirit and sizes under one product", () => {
    const uk8 = base({ id: "u8", product_group: "Asics", variant_label: "UK 8", stock_qty: 2 });
    const uk9 = base({ id: "u9", product_group: "Asics", variant_label: "UK 9", stock_qty: 3 });
    const g = groupForPos([single, double, uk8, uk9, buddy], all);
    expect(g).toHaveLength(3);
    expect(g[0].options.map(o => o.label)).toEqual(["Single", "Double"]);
    expect(g[1].title).toBe("Asics");
    expect(onMenu(brandy)).toBe(false); // bottle itself not sold directly
  });
});

describe("club-configurable divisions and categories", () => {
  it("falls back to Bar/Shop and honours club divisions", () => {
    expect(resolveDivisions([]).map(d => d.key)).toEqual(["bar", "shop"]);
    const d = resolveDivisions([
      { key: "shop", label: "Pro Shop", sort_order: 0 },
      { key: "bar", label: "Bar", sort_order: 1 },
      { key: "kitchen", label: "Kitchen", sort_order: 2, archived_at: "2026-01-01" },
    ]);
    expect(d.map(x => x.label)).toEqual(["Pro Shop", "Bar"]);
  });
  it("lets a club rename, move and archive built-ins without affecting other clubs", () => {
    const clubA = [
      { value: "spirits", label: "Hard tack", division: "bar", sort_order: 0 },
      { value: "water", label: "Water", division: "bar", archived_at: "2026-01-01" },
      { value: "custom_k_tape", label: "K-Tape", division: "shop", sort_order: 0 },
    ];
    const bar = categoriesForDivision(clubA, "bar");
    expect(bar.find(c => c.value === "spirits")?.label).toBe("Hard tack");
    expect(bar.some(c => c.value === "water")).toBe(false);
    expect(categoriesForDivision(clubA, "shop").some(c => c.value === "custom_k_tape")).toBe(true);
    // A club with no rows still gets the untouched defaults.
    expect(allCategories([]).find(c => c.value === "spirits")?.label).toBe("Spirits");
  });
});

describe("Uitzig-style 28-tot spirits and mixers", () => {
  const gin = base({ id: "g", name: "Gin", unit_yield: 28, stock_units: totsToStockUnits(70), stock_qty: 2 });
  const coke = base({ id: "c", name: "Coke", stock_measure: "volume", unit_yield: 1000, stock_units: litresToUnits(2 + 2 + 1.5), stock_qty: 5, sellable: false });
  const glass = base({ id: "cg", item_kind: "option", stock_parent_id: "c", consume_units: servingMlFromPerLitre(4), stock_qty: 22 });
  const gd = base({ id: "gd", item_kind: "option", stock_parent_id: "g", consume_units: 2, stock_qty: 35 });
  const tonic = base({ id: "t", name: "Tonic 200ml", stock_units: 24, stock_qty: 24 });
  const sp = base({ id: "sp", item_kind: "special", stock_qty: 1 });
  const sp2 = base({ id: "sp2", item_kind: "special", stock_qty: 1 });
  const m = new Map([gin, coke, glass, gd, tonic, sp, sp2].map(i => [i.id, i]));
  const cc: SpecialComponent[] = [
    { special_item_id: "sp", component_item_id: "gd", quantity: 2 },
    { special_item_id: "sp", component_item_id: "cg", quantity: 2 },
    { special_item_id: "sp2", component_item_id: "gd", quantity: 1 },
    { special_item_id: "sp2", component_item_id: "t", quantity: 1 },
  ];
  it("70 tots at 28/bottle = 2.50 bottles, 2 + 14/28", () => {
    expect(wholeEquivalent(70, 28)).toBe(2.5);
    expect(formatStock(gin)).toBe("2.50 bottles (2 + 14/28 tots)");
  });
  it("bulk mixer: 5.5 L at 4 glasses/L = 22 servings", () => {
    expect(coke.stock_units).toBe(5500);
    expect(formatStock(coke)).toBe("5.50 L");
    expect(servingsAvailable(glass, coke)).toBe(22);
    expect(servingMlFromPerLitre(5)).toBe(200); // configurable, not hard-coded
  });
  it("recipe deducts exact spirit tots + mixer servings", () => {
    const need = stockRequirement(sp, 1, m, cc);
    expect(need.get("g")).toBe(4);
    expect(need.get("c")).toBe(500); // 2 glasses = 0.5 L
    expect(specialAvailable("sp", m, cc)).toBe(11); // min(70/4=17, 5500/500=11)
    const need2 = stockRequirement(sp2, 1, m, cc);
    expect(need2.get("t")).toBe(1); // packaged mixer = 1 serving
  });
  it("repeated sales never create or destroy stock", () => {
    let units = 70;
    for (let k = 0; k < 17; k++) units -= stockRequirement(sp, 1, m, cc).get("g")!;
    expect(units).toBe(2);
    expect(formatStock({ ...gin, stock_units: units })).toBe("0.07 bottles (0 + 2/28 tots)");
  });
});
