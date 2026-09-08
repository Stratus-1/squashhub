import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SportyHqRating {
  rating: number | null;
  confidence: number | null;
  /** Position in the SSA national ranking list, when SportyHQ publishes one. */
  nationalPosition: number | null;
  nationalLabel: string | null;
}

interface RankingRow {
  label?: string;
  position?: number;
  people?: number;
  points?: number;
}

function pickNational(rankings: unknown): { position: number | null; label: string | null } {
  if (!Array.isArray(rankings)) return { position: null, label: null };
  const rows = rankings as RankingRow[];
  const national = rows.find((r) =>
    /national ranking/i.test(r?.label ?? "") && /south africa/i.test(r?.label ?? ""),
  );
  if (!national) return { position: null, label: null };
  return { position: typeof national.position === "number" ? national.position : null, label: national.label ?? null };
}

/**
 * SportyHQ ratings for a set of club members, keyed by club_member_id.
 * Used to show a national strength indicator next to members on the ladder.
 */
export function useSportyHqRatings(memberIds: string[]) {
  const ids = [...new Set(memberIds)].sort();
  return useQuery({
    queryKey: ["sportyhq-ratings", ids.length, ids[0] ?? null, ids[ids.length - 1] ?? null],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, SportyHqRating>> => {
      const map = new Map<string, SportyHqRating>();
      const chunkSize = 200;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from("sportyhq_profiles")
          .select("club_member_id, rating, rating_confidence, rankings")
          .in("club_member_id", chunk);
        if (error) throw error;
        for (const row of data ?? []) {
          if (!row.club_member_id) continue;
          const national = pickNational(row.rankings);
          map.set(row.club_member_id, {
            rating: row.rating != null ? Number(row.rating) : null,
            confidence: row.rating_confidence != null ? Number(row.rating_confidence) : null,
            nationalPosition: national.position,
            nationalLabel: national.label,
          });
        }
      }
      return map;
    },
  });
}
