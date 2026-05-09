import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { useMyPermissions } from "@/hooks/use-club-permissions";
import { useClubContext } from "@/contexts/ClubContext";

/**
 * Visibility flags used by the desktop AppSidebar.
 * Mirrors the conditional logic on the Dashboard so sidebar items
 * appear/disappear in the same way as the dashboard tiles.
 */
export function useSidebarFlags() {
  const { club: contextClub } = useClubContext();
  const { data: clubData } = useMyClub();
  const isClubAdmin = useIsClubAdmin();
  const myPermissions = useMyPermissions();

  const effectiveClub = clubData?.club || contextClub;
  const clubId = effectiveClub?.id;

  const { data: clubLeagueAssociations } = useQuery({
    queryKey: ["league-associations", clubId],
    queryFn: async () => {
      if (!clubId) return [];
      const { data, error } = await fromExt("league_associations")
        .select("id")
        .eq("club_id", clubId!)
        .limit(1);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
  });

  // Also surface "Leagues" when any club member has an external association affiliation
  // (e.g. Riverside players affiliated to NSA via member_association_affiliations).
  const { data: externalAffiliationCount } = useQuery({
    queryKey: ["club-external-affiliations", clubId],
    queryFn: async () => {
      if (!clubId) return 0;
      const { data: members, error: mErr } = await fromExt("club_members")
        .select("id")
        .eq("club_id", clubId!);
      if (mErr) throw mErr;
      const ids = (members || []).map((m: any) => m.id);
      if (ids.length === 0) return 0;
      const { count, error } = await fromExt("member_association_affiliations")
        .select("id", { count: "exact", head: true })
        .in("club_member_id", ids)
        .eq("active", true);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!clubId,
  });

  return {
    hasLeagues: (clubLeagueAssociations || []).length > 0 || (externalAffiliationCount || 0) > 0,
    honestyBarEnabled: !!(effectiveClub as any)?.honesty_bar_enabled,
    hasAnyAdminAccess: isClubAdmin || myPermissions.size > 0,
    isAssociation: (effectiveClub as any)?.tenant_type === "association",
  };
}
