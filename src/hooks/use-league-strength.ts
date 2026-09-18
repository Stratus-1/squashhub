import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  computeLeagueStrength,
  type LeagueStrength,
  type RubberRow,
} from "@/lib/ladder/league-strength";

const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Regional-league strength per club member, derived from their rubber history.
 * Read-only: used to PROPOSE a refined ladder order, never to write one.
 */
export function useLeagueStrength(
  clubId: string | undefined,
  associationNumbers: Map<string, string[]> | undefined
) {
  const codesByMember = new Map<string, string[]>();
  const allCodes: string[] = [];
  for (const [memberId, numbers] of associationNumbers ?? []) {
    const codes = (numbers || []).map(normalizeCode).filter(Boolean);
    if (codes.length === 0) continue;
    codesByMember.set(memberId, codes);
    allCodes.push(...codes);
  }
  const codeKey = Array.from(new Set(allCodes)).sort().join(",");

  return useQuery({
    queryKey: ["ladder-league-strength", clubId, codeKey],
    enabled: !!clubId && allCodes.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const unique = Array.from(new Set(allCodes));
      const rows: RubberRow[] = [];
      const CHUNK = 200;
      for (let i = 0; i < unique.length; i += CHUNK) {
        const { data, error } = await supabase
          .from("nsa_rubber_history")
          .select("player_code, league_label, position, season_year, won")
          .in("player_code", unique.slice(i, i + CHUNK));
        if (error) throw error;
        rows.push(...((data || []) as RubberRow[]));
      }

      const byCode = new Map<string, RubberRow[]>();
      let latestYear = 0;
      for (const row of rows) {
        if (row.season_year && row.season_year > latestYear) latestYear = row.season_year;
        const code = normalizeCode(row.player_code || "");
        if (!code) continue;
        const list = byCode.get(code);
        if (list) list.push(row);
        else byCode.set(code, [row]);
      }
      if (!latestYear) latestYear = new Date().getFullYear();

      const result = new Map<string, LeagueStrength | null>();
      for (const [memberId, codes] of codesByMember) {
        const memberRows = codes.flatMap((c) => byCode.get(c) ?? []);
        const strength = computeLeagueStrength(memberRows, latestYear);
        if (strength) result.set(memberId, strength);
      }
      return result;
    },
  });
}
