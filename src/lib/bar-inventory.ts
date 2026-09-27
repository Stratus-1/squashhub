/**
 * Generic, club-configurable bar/shop inventory helpers.
 *
 * Model: Division -> Category -> Product -> Variant / Selling option.
 *  - item_kind "stock":   holds physical stock in `stock_units` (smallest unit, e.g. tots).
 *                         `unit_yield` = units per whole stock unit (bottle). 1 for ordinary items.
 *  - item_kind "option":  a selling option (Single / Double) that consumes `consume_units`
 *                         from its `stock_parent_id`. Holds no stock.
 *  - item_kind "special": a combo/recipe of components with optional validity window. Holds no stock.
 * Variants are ordinary stock items that share a `product_group` (e.g. shoe sizes).
 *
 * The database is authoritative (triggers deduct stock atomically); these helpers mirror its rules
 * for display and for client-side menu filtering.
 */

export type BarItemKind = "stock" | "option" | "special";
export type StockMeasure = "count" | "bottle" | "volume";

export interface InventoryItem {
  id: string;
  name: string;
  price: number;
  category: string;
  division?: string | null;
  active?: boolean;
  item_kind?: BarItemKind | null;
  stock_parent_id?: string | null;
  consume_units?: number | null;
  unit_yield?: number | null;
  unit_label?: string | null;
  stock_unit_label?: string | null;
  stock_units?: number | null;
  /** Labelling only: count (one-for-one), bottle (spirits by tot), volume (bulk mixer by litre). */
  stock_measure?: StockMeasure | null;
  stock_qty: number;
  sellable?: boolean | null;
  product_group?: string | null;
  variant_label?: string | null;
  archived_at?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  valid_days?: number[] | null;
  valid_start_time?: string | null;
  valid_end_time?: string | null;
  sort_order?: number;
  image_url?: string | null;
  barcode?: string | null;
}

export interface SpecialComponent {
  special_item_id: string;
  component_item_id: string;
  quantity: number;
}

export const DEFAULT_TOTS_PER_BOTTLE = 30;
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const kindOf = (i: Pick<InventoryItem, "item_kind">): BarItemKind => (i.item_kind as BarItemKind) || "stock";

/** Units of the stock root consumed by selling one of this (non-special) item. */
export function unitsPerSale(i: InventoryItem): number {
  return kindOf(i) === "option" ? Math.max(1, i.consume_units || 1) : Math.max(1, i.unit_yield || 1);
}

/** Aggregate stock requirement per root for selling `qty` of an item. */
export function stockRequirement(
  item: InventoryItem,
  qty: number,
  byId: Map<string, InventoryItem>,
  components: SpecialComponent[],
): Map<string, number> {
  const need = new Map<string, number>();
  const add = (root: string, units: number) => need.set(root, (need.get(root) || 0) + units);
  if (kindOf(item) === "special") {
    for (const c of components.filter(c => c.special_item_id === item.id)) {
      const ci = byId.get(c.component_item_id);
      if (!ci) continue;
      add(ci.stock_parent_id || ci.id, c.quantity * unitsPerSale(ci) * qty);
    }
  } else {
    add(item.stock_parent_id || item.id, unitsPerSale(item) * qty);
  }
  return need;
}

/** How many of a special can be sold from current stock. */
export function specialAvailable(
  specialId: string,
  byId: Map<string, InventoryItem>,
  components: SpecialComponent[],
): number {
  const special = byId.get(specialId);
  if (!special) return 0;
  const need = stockRequirement(special, 1, byId, components);
  if (need.size === 0) return 0;
  let min = Infinity;
  for (const [root, units] of need) {
    const r = byId.get(root);
    min = Math.min(min, Math.floor((r?.stock_units ?? 0) / units));
  }
  return Number.isFinite(min) ? min : 0;
}

/** Split a unit count into whole stock units + open remainder (e.g. 10 bottles + 20 tots). */
export function splitUnits(units: number, yieldPer: number): { whole: number; open: number } {
  const y = Math.max(1, yieldPer || 1);
  const u = Math.max(0, Math.floor(units || 0));
  return { whole: Math.floor(u / y), open: u % y };
}

export const ML_PER_LITRE = 1000;

export function measureOf(i: InventoryItem): StockMeasure {
  if (i.stock_measure) return i.stock_measure;
  return Math.max(1, i.unit_yield || 1) > 1 ? "bottle" : "count";
}

/** Decimal whole-unit equivalent, e.g. 70 tots at 28/bottle = 2.5 bottles; 5500 ml = 5.5 L. Display only. */
export function wholeEquivalent(units: number, yieldPer: number): number {
  return Math.max(0, units || 0) / Math.max(1, yieldPer || 1);
}

/** Convert an imported total-tots count to stock units (tots are the stored unit — no rounding). */
export function totsToStockUnits(totalTots: number): number {
  return Math.max(0, Math.round(totalTots));
}

/** Convert litres received/counted to ml stock units (integer ml; 5.5 L = 5500). */
export function litresToUnits(litres: number): number {
  return Math.max(0, Math.round((litres || 0) * ML_PER_LITRE));
}

/** Serving size in ml from a configurable servings-per-litre (4/L = 250 ml). */
export function servingMlFromPerLitre(servingsPerLitre: number): number {
  return Math.max(1, Math.round(ML_PER_LITRE / Math.max(0.001, servingsPerLitre || 1)));
}

/** Human stock label: "2.50 bottles (2 + 14/28 tots)", "5.50 L" or "24". */
export function formatStock(i: InventoryItem): string {
  const y = Math.max(1, i.unit_yield || 1);
  if (kindOf(i) !== "stock") return String(i.stock_qty ?? 0);
  const units = i.stock_units ?? 0;
  const m = measureOf(i);
  if (m === "volume") return `${wholeEquivalent(units, y).toFixed(2)} ${y === ML_PER_LITRE ? "L" : i.stock_unit_label || "units"}`;
  if (y === 1) return String(i.stock_units ?? i.stock_qty ?? 0);
  const { whole, open } = splitUnits(units, y);
  const bottle = i.stock_unit_label || "bottle";
  const tot = i.unit_label || "tot";
  const dec = `${wholeEquivalent(units, y).toFixed(2)} ${bottle}s`;
  return open ? `${dec} (${whole} + ${open}/${y} ${tot}s)` : dec;
}

/** Servings available from a bulk/serving option, e.g. Coke glass 250 ml from 5.5 L = 22. */
export function servingsAvailable(option: InventoryItem, parent: InventoryItem): number {
  return Math.floor((parent.stock_units ?? 0) / unitsPerSale(option));
}

function localParts(at: Date, timeZone = "Africa/Johannesburg") {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(at).map(x => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${hour}:${p.minute}:${p.second}`,
    dow: WEEKDAYS.indexOf(p.weekday as string),
  };
}

const t = (s?: string | null) => (s ? (s.length === 5 ? `${s}:00` : s) : null);

/** Mirrors bar_item_valid_now(): specials only sell inside their date/day/time window. */
export function isValidNow(i: InventoryItem, at: Date = new Date()): boolean {
  if (kindOf(i) !== "special") return true;
  const { date, time, dow } = localParts(at);
  if (i.valid_from && date < i.valid_from) return false;
  if (i.valid_to && date > i.valid_to) return false;
  if (i.valid_days && i.valid_days.length > 0 && !i.valid_days.includes(dow)) return false;
  const s = t(i.valid_start_time), e = t(i.valid_end_time);
  if (s && e) {
    if (s <= e) { if (time < s || time >= e) return false; }
    else if (time < s && time >= e) return false; // overnight window
  } else if (s && time < s) return false;
  else if (e && time >= e) return false;
  return true;
}

/** Should the item appear as sellable on a POS menu right now? */
export function onMenu(i: InventoryItem, at: Date = new Date()): boolean {
  return (i.active ?? true) && (i.sellable ?? true) && !i.archived_at && isValidNow(i, at) && (i.stock_qty ?? 0) > 0;
}

/** Validity summary for admin lists, e.g. "Fri 17:00–23:59". */
export function validitySummary(i: InventoryItem): string {
  const parts: string[] = [];
  if (i.valid_days?.length) parts.push(i.valid_days.map(d => WEEKDAYS[d]).join(", "));
  if (i.valid_start_time || i.valid_end_time)
    parts.push(`${(i.valid_start_time || "00:00").slice(0, 5)}–${(i.valid_end_time || "24:00").slice(0, 5)}`);
  if (i.valid_from || i.valid_to) parts.push(`${i.valid_from || "…"} → ${i.valid_to || "…"}`);
  return parts.join(" · ") || "Always";
}

export interface PosEntry {
  key: string;
  title: string;
  /** One option per sellable row (Single/Double, sizes); length 1 for simple products. */
  options: { item: InventoryItem; label: string }[];
  isSpecial: boolean;
}

/**
 * Group sellable rows for fast POS selection: selling options under their parent product,
 * variants under their product group, specials flagged. Input should already be filtered.
 */
export function groupForPos(items: InventoryItem[], all: InventoryItem[] = items): PosEntry[] {
  const byId = new Map(all.map(i => [i.id, i]));
  const groups = new Map<string, PosEntry>();
  const order: string[] = [];
  for (const i of items) {
    const kind = kindOf(i);
    let key: string, title: string, label: string;
    if (kind === "option" && i.stock_parent_id) {
      const parent = byId.get(i.stock_parent_id);
      key = `p:${i.stock_parent_id}`;
      title = i.product_group || parent?.name.replace(/\s*\d+\s*ml$/i, "") || i.name;
      label = i.variant_label || i.name;
    } else if (kind === "stock" && i.product_group) {
      key = `g:${i.product_group}`;
      title = i.product_group;
      label = i.variant_label || i.name;
    } else {
      key = `i:${i.id}`;
      title = i.name;
      label = i.name;
    }
    if (!groups.has(key)) {
      groups.set(key, { key, title, options: [], isSpecial: kind === "special" });
      order.push(key);
    }
    groups.get(key)!.options.push({ item: i, label });
  }
  return order.map(k => groups.get(k)!);
}
