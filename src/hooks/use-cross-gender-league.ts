/**
 * "Ladies may play and be ranked in the men's league".
 *
 * The association (e.g. NSA) sets the default in its league rules; a club may
 * override it for itself. When on, ladies with recent men's-league history are
 * offered automatically when filling men's teams and are listed in the men's
 * ladder alongside their own ladies' ladder place.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import {
  buildCrossGenderQualifications,
  normalizeAssociationCode,
  resolveCrossGenderSetting,
  type CrossGenderQualification,
  type CrossGenderRubberRow,
} from "@/lib/leagues/cross-gender";

/** Resolved switch for this club (association default + club override). */
export function useCrossGenderLeagueSetting(
  clubId: string | null | undefined,
  associationId?: string | null,
) {
  return useQuery({
    queryKey: ["cross-gender-setting", clubId, associationId || "any"],
    enabled: !!clubId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: club } = await supabase
        .from("clubs")
        .select("cross_gender_league_play_allowed")
        .eq("id", clubId!)
        .maybeSingle();

      let associationDefault = false;
      let rules = fromExt("league_rules")
        .select("cross_gender_league_play_allowed, association_id, club_id")
        .limit(20);
      if (associationId) rules = rules.eq("association_id", associationId);
      else rules = rules.eq("club_id", clubId!);
      const { data: ruleRows } = await rules;
      associationDefault = ((ruleRows as any[]) || []).some(
        (r) => r?.cross_gender_league_play_allowed === true,
      );

      return resolveCrossGenderSetting(
        (club as any)?.cross_gender_league_play_allowed ?? null,
        associationDefault,
      );
    },
  });
}

/**
 * Members who qualify to be listed on the other gender's side: currently
 * ladies with men's-league rubbers in the current or previous season.
 * Read-only — nothing is written until an admin saves.
 */
export function useCrossGenderPlayers(
  clubId: string | null | undefined,
  associationNumbers: Map<string, string[]> | undefined,
  enabled: boolean,
) {
  const codesByMember = new Map<string, string[]>();
  const allCodes: string[] = [];
  for (const [memberId, numbers] of associationNumbers ?? []) {
    const codes = (numbers || []).map(normalizeAssociationCode).filter(Boolean);
    if (codes.length === 0) continue;
    codesByMember.set(memberId, codes);
    allCodes.push(...codes);
  }
  const codeKey = Array.from(new Set(allCodes)).sort().join(",");

  return useQuery<Map<string, CrossGenderQualification>>({
    queryKey: ["cross-gender-players", clubId, codeKey],
    enabled: !!enabled && !!clubId && allCodes.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const unique = Array.from(new Set(allCodes));
      const rows: CrossGenderRubberRow[] = [];
      const CHUNK = 200;
      for (let i = 0; i < unique.length; i += CHUNK) {
        const { data, error } = await supabase
          .from("nsa_rubber_history")
          .select("player_code, category, league_label, position, season_year, won")
          .in("player_code", unique.slice(i, i + CHUNK));
        if (error) throw error;
        rows.push(...((data || []) as CrossGenderRubberRow[]));
      }
      return buildCrossGenderQualifications(rows, codesByMember);
    },
  });
}
