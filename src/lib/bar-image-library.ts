import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";

/** Shared, generic AI product photos any club may reuse (never club uploads). */
export interface LibraryImage { id: string; image_url: string; label: string; keywords: string; category: string | null }

export function useBarImageLibrary(enabled = true) {
  return useQuery({
    queryKey: ["bar-image-library"],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await fromExt("bar_image_library").select("id, image_url, label, keywords, category");
      if (error) throw error;
      return (data || []) as LibraryImage[];
    },
  });
}

const STOP = new Set(["the", "and", "plus", "with", "ml", "single", "double", "glass", "bottle", "x", "of", "a"]);
const ALIAS: Record<string, string> = { coca: "coke", cola: "coke", coke: "coke", whisky: "whiskey", choc: "chocolate" };
const norm = (w: string) => ALIAS[w] ?? (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const words = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(w => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w)).map(norm);

/** Rank library photos by word overlap with an item name (label words weigh most). */
export function suggestLibraryImages(lib: LibraryImage[], name: string, category?: string | null, limit = 6) {
  const q = words(name);
  if (!q.length) return [];
  return lib
    .map(img => {
      const label = new Set(words(img.label));
      const kw = new Set(words(img.keywords));
      let score = 0;
      for (const w of q) {
        if (label.has(w)) score += 3;
        else if (kw.has(w)) score += 2;
        else if ([...kw].some(k => k.length > 3 && w.length > 3 && (k.startsWith(w) || w.startsWith(k)))) score += 1;
      }
      if (score && category && img.category && img.category.toLowerCase() === category.toLowerCase()) score += 0.5;
      return { img, score };
    })
    .filter(x => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.img);
}
