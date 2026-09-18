import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Active league/association numbers (e.g. NSA "NSF4207") for a set of club members,
 * keyed by club_member_id. Shown beside members on the ladder so admins and players
 * can see at a glance who is affiliated and under which number.
 */
export function useAssociationNumbers(memberIds: string[]) {
  const ids = [...new Set(memberIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["association-numbers", ids.length, ids[0] ?? null, ids[ids.length - 1] ?? null],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, string[]>> => {
      const map = new Map<string, string[]>();
      const chunkSize = 300;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from("member_association_affiliations")
          .select("club_member_id, league_association_number")
          .in("club_member_id", chunk)
          .eq("active", true);
        if (error) throw error;
        (data || []).forEach((row: any) => {
          const num = String(row.league_association_number || "").trim();
          if (!num) return;
          const key = String(row.club_member_id);
          const list = map.get(key) || [];
          if (!list.includes(num)) list.push(num);
          map.set(key, list);
        });
      }
      map.forEach((list) => list.sort());
      return map;
    },
  });
}
