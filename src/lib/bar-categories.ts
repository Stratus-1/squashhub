import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";

/** Division key. "bar" and "shop" are the defaults; clubs can add their own. */
export type BarDivision = string;

export interface BarCategory {
  value: string;
  label: string;
  division: BarDivision;
  custom?: boolean;
  id?: string;
  sort_order?: number;
  archived?: boolean;
}

export interface BarDivisionDef {
  id?: string;
  key: string;
  label: string;
  sort_order: number;
  archived?: boolean;
}

export interface CustomCategoryRow {
  id?: string;
  value: string;
  label: string;
  division: string;
  sort_order?: number;
  archived_at?: string | null;
}

/** Built-in categories. Clubs can rename/reorder/archive them or add their own via club_bar_categories. */
export const BUILTIN_BAR_CATEGORIES: BarCategory[] = [
  { value: "soft_drinks", label: "Cold Drinks", division: "bar" },
  { value: "water", label: "Water", division: "bar" },
  { value: "energy", label: "Energy Drinks", division: "bar" },
  { value: "beer_cider", label: "Beer & Cider", division: "bar" },
  { value: "wine", label: "Wine", division: "bar" },
  { value: "spirits", label: "Spirits", division: "bar" },
  { value: "hot_drinks", label: "Hot Drinks", division: "bar" },
  { value: "snacks", label: "Snacks & Sweets", division: "bar" },
  { value: "meals", label: "Light Meals", division: "bar" },
  { value: "restaurant", label: "Restaurant", division: "bar" },
  { value: "rackets", label: "Rackets", division: "shop" },
  { value: "clothing", label: "Clothing", division: "shop" },
  { value: "footwear", label: "Footwear", division: "shop" },
  { value: "accessories", label: "Accessories", division: "shop" },
  { value: "other", label: "Other", division: "bar" },
];

export const BAR_CATEGORY_EMOJI: Record<string, string> = {
  soft_drinks: "🥤", water: "💧", energy: "⚡", beer_cider: "🍺", wine: "🍷", spirits: "🥃",
  hot_drinks: "☕", snacks: "🍿", meals: "🥪", restaurant: "🍔", rackets: "🏸", clothing: "👕", footwear: "👟",
  accessories: "🧢", other: "📦", drinks: "🥤", alcohol: "🍺",
  custom_beer: "🍺", custom_cider: "🍏", custom_spirits: "🥃", custom_wine: "🍷", custom_food: "🥪",
  custom_chips: "🍟", custom_hot_drinks: "☕", custom_cold_drinks_buddies: "🥤", custom_balls: "🟢",
  custom_shoes: "👟", custom_clothing: "👕", custom_racquets: "🎾", custom_bags: "🎒",
  custom_mixers: "🥤", custom_racketball: "⚫", custom_grips: "🖐️", custom_premix_hardtack: "🍹",
  custom_strings: "🧵", custom_socks: "🧦", custom_eyewear: "🥽", custom_sweets_snacks: "🍬",
  custom_wristbands_headbands: "🎽", custom_fitness_accessories: "💪", custom_k_tape: "🩹",
};

/** Default divisions for clubs that have not configured their own. */
export const BAR_DIVISIONS: BarDivisionDef[] = [
  { key: "bar", label: "Bar", sort_order: 0 },
  { key: "shop", label: "Shop", sort_order: 1 },
];

/** Club divisions (active, ordered), falling back to Bar / Shop. */
export function resolveDivisions(rows: { id?: string; key: string; label: string; sort_order: number; archived_at?: string | null }[] | undefined, includeArchived = false): BarDivisionDef[] {
  if (!rows || rows.length === 0) return BAR_DIVISIONS;
  return rows
    .map(r => ({ id: r.id, key: r.key, label: r.label, sort_order: r.sort_order, archived: !!r.archived_at }))
    .filter(d => includeArchived || !d.archived)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

export function divisionLabel(divs: BarDivisionDef[], key: string | null | undefined): string {
  const k = key || "bar";
  return divs.find(d => d.key === k)?.label || k.charAt(0).toUpperCase() + k.slice(1);
}

/** Turn a label into a stable slug, prefixed so customs never clash with built-ins. */
export function categoryValueFromLabel(label: string): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `custom_${slug || "category"}`;
}

export function divisionKeyFromLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "division";
}

/**
 * All categories (built-ins merged with club rows). A club row with the same value as a built-in
 * overrides it (rename, move, reorder, archive) for that club only.
 */
export function allCategories(custom: CustomCategoryRow[], includeArchived = false): BarCategory[] {
  const overrides = new Map(custom.map(c => [c.value, c]));
  const builtins: BarCategory[] = BUILTIN_BAR_CATEGORIES.map((b, idx) => {
    const o = overrides.get(b.value);
    return o
      ? { value: b.value, label: o.label, division: o.division, id: o.id, sort_order: o.sort_order ?? idx, archived: !!o.archived_at }
      : { ...b, sort_order: 100 + idx };
  });
  const builtinValues = new Set(BUILTIN_BAR_CATEGORIES.map(b => b.value));
  const customs: BarCategory[] = custom
    .filter(c => !builtinValues.has(c.value))
    .map(c => ({ value: c.value, label: c.label, division: c.division, custom: true, id: c.id, sort_order: c.sort_order ?? 0, archived: !!c.archived_at }));
  return [...customs, ...builtins]
    .filter(c => includeArchived || !c.archived)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label.localeCompare(b.label));
}

/** Active categories for one division. */
export function categoriesForDivision(custom: CustomCategoryRow[], division: BarDivision): BarCategory[] {
  return allCategories(custom).filter(c => c.division === division);
}

/** Label lookup across built-ins and customs, with legacy fallbacks. */
export function categoryLabel(custom: CustomCategoryRow[], value: string): string {
  const found = allCategories(custom, true).find(c => c.value === value);
  if (found) return found.label;
  if (value === "drinks") return "Drinks";
  if (value === "alcohol") return "Alcohol";
  return value.replace(/^custom_/, "").replace(/_/g, " ");
}

/** Load the club's category rows (custom + built-in overrides, including archived). */
export function useBarCategories(clubId: string | undefined) {
  return useQuery({
    queryKey: ["club-bar-categories", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_bar_categories")
        .select("id, club_id, division, label, value, sort_order, archived_at")
        .eq("club_id", clubId)
        .order("sort_order")
        .order("label");
      if (error) throw error;
      return (data || []) as (CustomCategoryRow & { id: string; club_id: string; sort_order: number })[];
    },
    enabled: !!clubId,
  });
}

/** Load the club's divisions (falls back to Bar / Shop when none configured). */
export function useBarDivisions(clubId: string | undefined, includeArchived = false) {
  const q = useQuery({
    queryKey: ["club-bar-divisions", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_bar_divisions")
        .select("id, key, label, sort_order, archived_at")
        .eq("club_id", clubId)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as { id: string; key: string; label: string; sort_order: number; archived_at: string | null }[];
    },
    enabled: !!clubId,
  });
  return { ...q, rows: q.data || [], divisions: resolveDivisions(q.data, includeArchived) };
}
