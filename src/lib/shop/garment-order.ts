import { z } from "zod";

export type GarmentFit = { key: string; label: string; sizes: string[]; chart?: [string, number, number, number, number][]; image?: string; swatch?: string[] };
/** choice_label: what the fit buttons are called (e.g. "Colour"); unit: noun for one item (e.g. "pair"); size_note: extra size guidance. */
export type GarmentOptions = { back_name?: boolean; note?: string; fits: GarmentFit[]; choice_label?: string; unit?: string; size_note?: string; size_labels?: Record<string, string> };
export type GarmentLine = { fit: string; size: string; back_name: string };

export const BACK_NAME_MAX = 20;
export const backNameSchema = z.string().trim().min(1, "Type the name for the back").max(BACK_NAME_MAX, `Max ${BACK_NAME_MAX} characters`);

export function parseGarmentOptions(raw: unknown): GarmentOptions | null {
  const o = raw as GarmentOptions | null;
  if (!o || !Array.isArray(o.fits) || o.fits.length === 0) return null;
  return o;
}

/** Returns an error message per line, or null when the line can be ordered. */
export function lineError(line: GarmentLine, opts: GarmentOptions): string | null {
  const fit = opts.fits.find(f => f.key === line.fit);
  if (!fit) return opts.choice_label ? `Choose a ${opts.choice_label.toLowerCase()}` : "Choose Men's or Ladies'";
  if (!fit.sizes.includes(line.size)) return "Choose a size";
  if (opts.back_name === false) return null;
  const r = backNameSchema.safeParse(line.back_name);
  return r.success ? null : r.error.issues[0].message;
}

export const orderTotal = (count: number, unitPrice: number) => Math.round(count * unitPrice * 100) / 100;

export type PrinterRow = { fit: string; size: string; back_name: string; member: string };
/** Count per fit/size for the printer, in the item's size order. */
export function sizeCounts(rows: PrinterRow[], opts: GarmentOptions) {
  return opts.fits.flatMap(f => f.sizes.map(size => ({
    fit: f.label, size, count: rows.filter(r => r.fit === f.key && r.size === size).length,
  }))).filter(r => r.count > 0);
}
