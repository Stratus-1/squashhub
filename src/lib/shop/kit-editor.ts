import type { GarmentOptions } from "./garment-order";

export type KitFitDraft = { key: string; label: string; sizes: string; chart?: unknown };
export type KitForm = { kit_on: boolean; kit_note: string; kit_back_name: boolean; kit_fits: KitFitDraft[]; kit_raw: Record<string, unknown> | null };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "fit";

/** Turn saved order_options into editable form fields. */
export function kitFormFrom(raw: unknown): KitForm {
  const o = raw as GarmentOptions | null;
  if (!o || !Array.isArray(o.fits) || !o.fits.length) return { kit_on: false, kit_note: "", kit_back_name: true, kit_fits: [], kit_raw: null };
  return {
    kit_on: true, kit_note: o.note ?? "", kit_back_name: o.back_name !== false, kit_raw: o as unknown as Record<string, unknown>,
    kit_fits: o.fits.map(f => ({ key: f.key, label: f.label, sizes: f.sizes.join(", "), chart: f.chart })),
  };
}

/** Build order_options from the form; keeps each fit's key and size chart so existing orders still match. */
export function kitOptionsFrom(f: KitForm): GarmentOptions | null {
  const used = new Set<string>();
  const fits = f.kit_fits
    .map(d => ({ d, sizes: d.sizes.split(",").map(s => s.trim()).filter(Boolean) }))
    .filter(x => x.d.label.trim() && x.sizes.length)
    .map(({ d, sizes }) => {
      let key = d.key || slug(d.label);
      while (used.has(key)) key += "_2";
      used.add(key);
      const fit: GarmentOptions["fits"][number] = { key, label: d.label.trim(), sizes };
      const prev = (f.kit_raw as GarmentOptions | null)?.fits?.find(p => p.key === key);
      if (prev?.image) fit.image = prev.image;
      if (Array.isArray(d.chart)) fit.chart = (d.chart as [string, number, number, number, number][]).filter(r => sizes.includes(r[0]));
      return fit;
    });
  if (!fits.length) return null;
  return { ...(f.kit_raw ?? {}), back_name: f.kit_back_name, note: f.kit_note.trim() || undefined, fits };
}
