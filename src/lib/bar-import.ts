/**
 * Bulk bar/shop item import — pure parsing, column mapping, validation and planning.
 * Nothing here writes to the database; the dialog executes an approved plan.
 * Specials/combos are recipes and are deliberately NOT importable (rejected per row).
 */
import { allCategories, categoryValueFromLabel, type BarDivisionDef, type CustomCategoryRow } from "./bar-categories";

export type ImportField =
  | "name" | "division" | "category" | "price" | "cost" | "stock" | "type" | "yield"
  | "product_group" | "variant" | "barcode" | "low_stock"
  | "single_price" | "double_price" | "serving_ml" | "serving_price";

export const IMPORT_FIELDS: { key: ImportField; label: string; help: string; aliases: string[] }[] = [
  { key: "name", label: "Item name *", help: "Required", aliases: ["name", "item", "item name", "product", "product name", "description", "stock item"] },
  { key: "division", label: "Division", help: "Bar / Shop or your own", aliases: ["division", "section", "department"] },
  { key: "category", label: "Category", help: "New categories are created on import", aliases: ["category", "group", "type of item", "cat"] },
  { key: "price", label: "Selling price", help: "Per unit sold", aliases: ["price", "sell price", "selling price", "retail", "sale price", "price (r)"] },
  { key: "cost", label: "Cost (per unit/bottle/litre)", help: "Opening average cost", aliases: ["cost", "cost price", "unit cost", "average cost", "avg cost", "purchase price", "opening cost"] },
  { key: "stock", label: "Opening stock", help: "Units, bottles (2.5 ok) or litres", aliases: ["stock", "qty", "quantity", "on hand", "opening stock", "stock on hand", "count", "stock qty"] },
  { key: "type", label: "Stock type", help: "unit / bottle (spirit) / litre (bulk mixer)", aliases: ["type", "stock type", "unit type", "measure", "kind"] },
  { key: "yield", label: "Tots per bottle", help: "Spirits only (default 30)", aliases: ["tots per bottle", "tots", "yield", "servings per bottle"] },
  { key: "single_price", label: "Single price", help: "Spirits: creates a Single (1 tot) option", aliases: ["single", "single price", "single tot"] },
  { key: "double_price", label: "Double price", help: "Spirits: creates a Double (2 tots) option", aliases: ["double", "double price", "double tot"] },
  { key: "serving_ml", label: "Serving size (ml)", help: "Bulk mixers: e.g. 250 per glass", aliases: ["serving ml", "glass ml", "serving size", "ml per glass"] },
  { key: "serving_price", label: "Serving price", help: "Bulk mixers: price per glass", aliases: ["glass price", "serving price"] },
  { key: "product_group", label: "Product group", help: "e.g. Asics Gel shoe", aliases: ["product group", "group name", "model"] },
  { key: "variant", label: "Variant / size", help: "e.g. UK 9, Large", aliases: ["variant", "size", "colour", "color"] },
  { key: "barcode", label: "Barcode", help: "", aliases: ["barcode", "ean", "sku code", "upc"] },
  { key: "low_stock", label: "Low-stock alert", help: "", aliases: ["low stock", "reorder level", "min", "minimum", "low stock threshold"] },
];

export type Mapping = Partial<Record<ImportField, number>>;
export type StockType = "unit" | "bottle" | "litre";
export type RowAction = "create" | "update" | "skip";

export interface ExistingItem {
  id: string; name: string; item_kind?: string | null; variant_label?: string | null; barcode?: string | null;
  unit_yield?: number | null; stock_measure?: string | null; archived_at?: string | null; stock_parent_id?: string | null;
  avg_unit_cost?: number | null; consume_units?: number | null;
}

export interface PlannedRow {
  row: number;               // spreadsheet row number (1 = header)
  name: string;
  errors: string[];
  warnings: string[];
  matchId?: string;
  matchName?: string;
  action: RowAction;
  division: string;
  category: string;          // category value
  newCategory?: { value: string; label: string; division: string };
  type: StockType;
  yield: number;             // smallest units per stock unit
  stockUnits: number | null; // smallest units, null = not given
  price: number | null;
  cost: number | null;       // per bottle / litre / unit
  lowStock: number | null;
  barcode: string | null;
  productGroup: string | null;
  variant: string | null;
  singlePrice: number | null;
  doublePrice: number | null;
  servingMl: number | null;
  servingPrice: number | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF, ; or tab delimiters auto-detected). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const first = clean.split(/\r?\n/)[0] || "";
  const delim = [",", ";", "\t"].reduce((best, d) => (first.split(d).length > first.split(best).length ? d : best), ",");
  const rows: string[][] = [];
  let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (q) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(v => v.trim())).filter(r => r.some(v => v !== ""));
}

/** Guess column → field from header text. Each column is used at most once. */
export function autoMap(headers: string[]): Mapping {
  const m: Mapping = {}; const used = new Set<number>();
  for (const f of IMPORT_FIELDS) {
    const idx = headers.findIndex((h, i) => !used.has(i) && f.aliases.includes(norm(h)));
    if (idx >= 0) { m[f.key] = idx; used.add(idx); }
  }
  return m;
}

export function parseNumber(v: string | undefined): number | null | "bad" {
  if (v == null) return null;
  const s = String(v).replace(/[R$\s]/gi, "").replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : "bad";
}

export function parseType(v: string | undefined): StockType | "special" | "bad" | null {
  const s = norm(v || "");
  if (!s) return null;
  if (["unit", "units", "each", "item", "count", "ea", "can", "packaged", "packaged mixer", "pack"].includes(s)) return "unit";
  if (["bottle", "bottles", "spirit", "spirits", "tot", "tots"].includes(s)) return "bottle";
  if (["litre", "litres", "liter", "liters", "l", "bulk", "bulk mixer", "mixer bulk", "volume"].includes(s)) return "litre";
  if (["special", "specials", "combo", "combos", "bundle", "recipe"].includes(s)) return "special";
  return "bad";
}

export const itemKey = (name: string, variant?: string | null) => `${norm(name)}|${norm(variant || "")}`;

interface PlanCtx {
  existing: ExistingItem[];
  divisions: BarDivisionDef[];
  customCategories: CustomCategoryRow[];
  defaultTotsPerBottle?: number;
}

/** Validate every data row and propose create/update/skip. Pure: never touches the DB. */
export function planImport(rows: string[][], mapping: Mapping, ctx: PlanCtx): PlannedRow[] {
  const cats = allCategories(ctx.customCategories);
  const live = ctx.existing.filter(e => !e.archived_at);
  const byKey = new Map(live.map(e => [itemKey(e.name, e.variant_label), e]));
  const byBarcode = new Map(live.filter(e => e.barcode).map(e => [String(e.barcode).trim(), e]));
  const seen = new Map<string, number>();
  const newCats = new Map<string, { value: string; label: string; division: string }>();
  const get = (r: string[], f: ImportField) => (mapping[f] == null ? undefined : r[mapping[f]!]);
  const num = (r: string[], f: ImportField, errors: string[], label: string, min = 0) => {
    const n = parseNumber(get(r, f));
    if (n === "bad") { errors.push(`${label} is not a number`); return null; }
    if (n != null && n < min) { errors.push(`${label} cannot be negative`); return null; }
    return n;
  };

  return rows.map((r, i) => {
    const errors: string[] = []; const warnings: string[] = [];
    const name = (get(r, "name") || "").trim();
    if (!name) errors.push("Item name is missing");
    if (name.length > 120) errors.push("Item name is longer than 120 characters");

    // Division
    const divRaw = (get(r, "division") || "").trim();
    let division = ctx.divisions[0]?.key || "bar";
    if (divRaw) {
      const d = ctx.divisions.find(x => norm(x.key) === norm(divRaw) || norm(x.label) === norm(divRaw));
      if (d) division = d.key; else errors.push(`Division "${divRaw}" doesn't exist — add it under Divisions & categories first`);
    }

    // Type
    const t = parseType(get(r, "type"));
    const yieldRaw = num(r, "yield", errors, "Tots per bottle", 1);
    const servingMl = num(r, "serving_ml", errors, "Serving size", 1);
    let type: StockType = t === "unit" || t === "bottle" || t === "litre" ? t : yieldRaw && yieldRaw > 1 ? "bottle" : "unit";
    if (t === "special") errors.push("Specials/combos are recipes — create them with \"Add Special / Bundle\", not by import");
    if (t === "bad") errors.push(`Stock type "${get(r, "type")}" not recognised (use unit, bottle or litre)`);
    if (t == null && servingMl && !yieldRaw) type = "litre";

    let yieldN = 1;
    if (type === "bottle") {
      yieldN = Math.round(yieldRaw ?? ctx.defaultTotsPerBottle ?? 30);
      if (yieldRaw == null) warnings.push(`Tots per bottle not given — using ${yieldN}`);
      if (yieldN < 2 || yieldN > 1000) errors.push("Tots per bottle must be between 2 and 1000");
    } else if (type === "litre") {
      yieldN = 1000;
      if (servingMl != null && servingMl > 1000) errors.push("Serving size cannot be more than 1000 ml");
    }

    // Category
    const catRaw = (get(r, "category") || "").trim();
    let category = cats.find(c => c.division === division)?.value || "other";
    let newCategory: PlannedRow["newCategory"];
    if (catRaw) {
      const c = cats.find(x => norm(x.label) === norm(catRaw) || norm(x.value) === norm(catRaw));
      if (c) {
        category = c.value;
        if (c.division !== division) warnings.push(`Category "${c.label}" belongs to another division`);
      } else {
        const value = categoryValueFromLabel(catRaw);
        const key = `${division}|${value}`;
        newCategory = newCats.get(key) || { value, label: catRaw.slice(0, 60), division };
        newCats.set(key, newCategory);
        category = value;
        warnings.push(`New category "${newCategory.label}" will be created`);
      }
    }

    const price = num(r, "price", errors, "Selling price");
    const cost = num(r, "cost", errors, "Cost");
    const lowStock = num(r, "low_stock", errors, "Low-stock alert");
    const singlePrice = num(r, "single_price", errors, "Single price");
    const doublePrice = num(r, "double_price", errors, "Double price");
    const servingPrice = num(r, "serving_price", errors, "Serving price");
    const stock = num(r, "stock", errors, "Opening stock");
    let stockUnits: number | null = null;
    if (stock != null) {
      if (type === "unit" && !Number.isInteger(stock)) errors.push("Opening stock must be a whole number for unit items");
      else stockUnits = Math.round(stock * yieldN);
    }
    if ((singlePrice != null || doublePrice != null) && type !== "bottle") errors.push("Single/Double prices are only for spirits (stock type bottle)");
    if (servingPrice != null && type !== "litre") errors.push("Serving price is only for bulk mixers (stock type litre)");
    if (type === "litre" && servingPrice != null && servingMl == null) errors.push("Give the serving size (ml) for the serving price");
    if (type === "unit" && price == null) errors.push("Selling price is missing");
    if (type === "bottle" && price == null && singlePrice == null && doublePrice == null)
      warnings.push("No bottle, single or double price — the bottle is stock only");

    const variant = (get(r, "variant") || "").trim() || null;
    const barcode = (get(r, "barcode") || "").trim() || null;

    // Duplicates inside the file
    const key = itemKey(name, variant);
    if (name) {
      if (seen.has(key)) errors.push(`Duplicate of row ${seen.get(key)} in this file`);
      else seen.set(key, i + 2);
    }

    // Match existing items in THIS club only (ctx.existing is club-scoped by the caller)
    const match = byKey.get(key) || (barcode ? byBarcode.get(barcode) : undefined);
    let action: RowAction = "create";
    if (match) {
      if ((match.item_kind || "stock") === "special") errors.push(`"${match.name}" is an existing special — not changed by import`);
      else if ((match.item_kind || "stock") === "option") errors.push(`"${match.name}" is a selling option — import its stock product instead`);
      action = "update";
      const matchYield = Math.max(1, match.unit_yield || 1);
      const matchType: StockType = match.stock_measure === "volume" ? "litre" : matchYield > 1 ? "bottle" : "unit";
      if (mapping.type != null || mapping.yield != null) {
        if (matchType !== type || matchYield !== yieldN) warnings.push("Stock type/tots per bottle differ from the existing item — kept as is");
      }
      type = matchType; yieldN = matchYield;
      if (stock != null) { warnings.push("Stock count is not changed on existing items — use a stocktake"); stockUnits = null; }
      if (cost != null && match.avg_unit_cost != null) warnings.push("Existing average cost is kept — use \"Set cost\" to correct it");
    }

    return {
      row: i + 2, name, errors, warnings, matchId: match?.id, matchName: match?.name,
      action: errors.length ? "skip" : action, division, category, newCategory, type, yield: yieldN, stockUnits,
      price, cost, lowStock, barcode, productGroup: (get(r, "product_group") || "").trim() || null, variant,
      singlePrice, doublePrice, servingMl, servingPrice,
    };
  });
}

export const TEMPLATE_CSV = [
  "Item name,Division,Category,Stock type,Tots per bottle,Selling price,Single price,Double price,Serving size (ml),Serving price,Cost,Opening stock,Variant,Barcode",
  "Castle Lite,Bar,Beer & Cider,unit,,30,,,,,18,48,,",
  "Klipdrift,Bar,Spirits,bottle,30,,20,38,,,300,2.5,,",
  "Coke (bulk),Bar,Soft Drinks,litre,,,,,250,12,20,5.5,,",
  "Tonic Can 200ml,Bar,Soft Drinks,unit,,15,,,,,8,24,,",
  "Asics Gel shoe,Shop,Footwear,unit,,1800,,,,,1200,2,UK 9,",
].join("\n");
