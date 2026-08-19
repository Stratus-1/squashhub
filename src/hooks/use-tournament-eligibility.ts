import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  resolveEligibleClubs,
  type OrgRow,
  type RelRow,
} from "@/lib/tournaments/eligibility";

/** Federation hierarchy rows needed to resolve eligibility client-side. */
export function useOrgHierarchyLite() {
  return useQuery({
    queryKey: ["org-hierarchy-lite"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [orgsRes, relsRes, clubsRes] = await Promise.all([
        supabase.from("organisations").select("id, kind, name, club_id, is_internal_league"),
        supabase.from("organisation_relationships").select("parent_org_id, child_org_id, effective_to"),
        supabase.from("clubs").select("id, name"),
      ]);
      const orgs = ((orgsRes.data || []) as any[]).map((o) => ({ ...o, kind: String(o.kind) })) as OrgRow[];
      const rels = (relsRes.data || []) as unknown as RelRow[];
      const clubs = (clubsRes.data || []) as { id: string; name: string }[];
      return { orgs, rels, clubs, clubNames: new Map(clubs.map((c) => [c.id, c.name])) };
    },
  });
}

export interface TournamentEligibility {
  clubIds: string[];
  clubCount: number;
  memberCount: number;
  scopeOrgName: string | null;
  /** e.g. "143 members across 8 clubs in Western Province Squash" */
  summary: string;
}

/**
 * Live eligible population for a "Who may enter" scope. Works before the
 * tournament is saved because it is derived from the hierarchy, not from a
 * stored tournament row. Mirrors the server-side eligibility functions.
 */
export function useTournamentEligibility(args: {
  scope: string;
  clubId: string | null;
  ownerOrgId?: string | null;
  enabled?: boolean;
}): TournamentEligibility | null {
  const { scope, clubId, ownerOrgId = null, enabled = true } = args;
  const { data: hierarchy } = useOrgHierarchyLite();

  const resolved =
    hierarchy && enabled
      ? resolveEligibleClubs({
          scope,
          clubId,
          ownerOrgId,
          orgs: hierarchy.orgs,
          rels: hierarchy.rels,
          clubNames: hierarchy.clubNames,
          allClubIds: hierarchy.clubs.map((c) => c.id),
        })
      : null;

  const clubIds = resolved?.clubIds || [];
  const key = [...clubIds].sort().join(",");

  const { data: memberCount = 0 } = useQuery({
    queryKey: ["tournament-eligible-count", key],
    enabled: !!resolved && clubIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("club_members")
        .select("id", { count: "exact", head: true })
        .in("club_id", clubIds)
        .eq("status", "active")
        .neq("role", "visitor");
      if (error) throw error;
      return count ?? 0;
    },
  });

  if (!resolved) return null;

  const where =
    scope === "club"
      ? resolved.scopeOrgName || "this club"
      : scope === "association"
        ? `${clubIds.length} club${clubIds.length === 1 ? "" : "s"} in ${resolved.scopeOrgName || "this association"}`
        : `${clubIds.length} club${clubIds.length === 1 ? "" : "s"} across ${resolved.scopeOrgName || "the federation"}, including unaffiliated clubs`;

  return {
    clubIds,
    clubCount: clubIds.length,
    memberCount,
    scopeOrgName: resolved.scopeOrgName,
    summary: `${memberCount.toLocaleString()} member${memberCount === 1 ? "" : "s"} in ${where}`,
  };
}
