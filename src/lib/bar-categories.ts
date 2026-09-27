import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";

export type BarDivision = "bar" | "shop";

export interface BarCategory {
  value: string;
  label: string;
  division: BarDivision;
  custom?: boolean;
}

/** Built-in categories. Clubs can add their own via club_bar_categories. */
export const BUILTIN_BAR_CATEGORIES: BarCategory[] = [
  { value: "soft_drinks", label: "Soft Drinks", division: "bar" },
  { value: "water", label: "Water", division: "bar" },
  { value: "energy", label: "Energy & Sports", division: "bar" },
  { value: "beer_cider", label: "Beer & Cider", division: "bar" },
  { value: "wine", label: "Wine", division: "bar" },
  { value: "spirits", label: "Spirits", division: "bar" },
  { value: "hot_drinks", label: "Hot Drinks", division: "bar" },
  { value: "snacks", label: "Snacks", division: "bar" },
  { value: "meals", label: "Light Meals", division: "bar" },
  { value: "rackets", label: "Rackets", division: "shop" },
  { value: "clothing", label: "Clothing", division: "shop" },
  { value: "footwear", label: "Footwear", division: "shop" },
  { value: "accessories", label: "Accessories", division: "shop" },
  { value: "other", label: "Other", division: "bar" },
];

export const BAR_CATEGORY_EMOJI: Record<string, string> = {
  soft_drinks: "🥤",
  water: "💧",
  energy: "⚡",
  beer_cider: "🍺",
  wine: "🍷",
  spirits: "🥃",
  hot_drinks: "☕",
  snacks: "🍿",
  meals: "🥪",
  rackets: "🏸",
  clothing: "👕",
  footwear: "👟",
  accessories: "🧢",
  other: "📦",
  // legacy values (existing items)
  drinks: "🥤",
  alcohol: "🍺",
};

export const BAR_DIVISIONS: { value: BarDivision; label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "shop", label: "Shop" },
];

/** Turn a category label into a stable value slug, prefixed so customs never clash with built-ins. */
export function categoryValueFromLabel(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `custom_${slug || "category"}`;
}

/** Built-in categories plus the club's own custom categories, for one division. */
export function categoriesForDivision(
  custom: { value: string; label: string; division: string }[],
  division: BarDivision,
): BarCategory[] {
  const builtins = BUILTIN_BAR_CATEGORIES.filter(c => c.division === division);
  const customs = custom
    .filter(c => c.division === division)
    .map(c => ({ value: c.value, label: c.label, division, custom: true as const }));
  return [...builtins, ...customs];
}

/** Label lookup across built-ins and customs, with legacy fallbacks. */
export function categoryLabel(
  custom: { value: string; label: string }[],
  value: string,
): string {
  const found =
    BUILTIN_BAR_CATEGORIES.find(c => c.value === value) ||
    custom.find(c => c.value === value);
  if (found) return found.label;
  if (value === "drinks") return "Drinks";
  if (value === "alcohol") return "Alcohol";
  return value.replace(/^custom_/, "").replace(/_/g, " ");
}

/** Load the club's custom bar/shop categories. */
export function useBarCategories(clubId: string | undefined) {
  return useQuery({
    queryKey: ["club-bar-categories", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_bar_categories")
        .select("id, club_id, division, label, value, sort_order")
        .eq("club_id", clubId)
        .order("sort_order")
        .order("label");
      if (error) throw error;
      return (data || []) as {
        id: string;
        club_id: string;
        division: BarDivision;
        label: string;
        value: string;
        sort_order: number;
      }[];
    },
    enabled: !!clubId,
  });
}
