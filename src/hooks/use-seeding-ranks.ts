import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { OVERALL_CATEGORY } from "@/hooks/use-nsa-rankings";

export interface SeedingRankMaps {
  /** Latest regional (association) ranking-list position per person. */
  regional: Map<string, number>;
  /** Latest national ranking-list position per person. */
  national: Map<string, number>;
}

/**
 * Ranking-list positions used to seed tournament draws from a regional or
 * national ranking instead of the club ladder. Maps person_id → rank on the
 * most recent published snapshot; players not on the list fall back to the
 * club ladder at the call site.
 *
 * @param associationId league-association row that owns the regional list
 */
export function useSeedingRankMaps(associationId: string | null | undefined, enabled = true) {
  return useQuery<SeedingRankMaps>({
    queryKey: ["seeding-rank-maps", associationId ?? "none"],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const load = async (assocId: string | null) => {
        let q = (supabase as any)
          .from("ranking_snapshots")
          .select("id")
          .order("computed_at", { ascending: false })
          .limit(1);
        q = assocId ? q.eq("association_id", assocId) : q.is("association_id", null);
        const { data: snap } = await q.maybeSingle();
        if (!snap?.id) return null;
        const { data: entries } = await (supabase as any)
          .from("ranking_snapshot_entries")
          .select("person_id, rank")
          .eq("snapshot_id", snap.id)
          .eq("category", OVERALL_CATEGORY)
          .not("person_id", "is", null);
        const map = new Map<string, number>();
        for (const e of (entries || []) as any[]) {
          if (e.person_id && e.rank != null) map.set(String(e.person_id), Number(e.rank));
        }
        return map;
      };
      const [regional, national] = await Promise.all([
        associationId ? load(associationId) : Promise.resolve(null),
        load(null),
      ]);
      return { regional: regional ?? new Map(), national: national ?? new Map() };
    },
  });
}
