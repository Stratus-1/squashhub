import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { associationOrgForTenant } from "@/lib/tournaments/eligibility";

export interface AssociationTenantContext {
  /** True when the signed-in tenant is an association/regional league, not a club. */
  isAssociation: boolean;
  /** Name of the association tenant. */
  name: string | null;
  /** The association organisation that owns its competitions, when one exists. */
  orgId: string | null;
  /** Clubs affiliated to this association — the venues and the player pool. */
  clubs: { id: string; name: string }[];
}

const EMPTY: AssociationTenantContext = { isAssociation: false, name: null, orgId: null, clubs: [] };

/**
 * Association tenants (e.g. Northern Squash Association) look like a club to the
 * app but own no courts and only a handful of officials. Their competitions draw
 * on every affiliated club: those clubs' courts are the venues and their members
 * are the entrant pool.
 */
export function useAssociationTenant(clubId: string | null | undefined): AssociationTenantContext & { isResolved: boolean } {
  const { data, isFetched } = useQuery({
    queryKey: ["association-tenant-context", clubId],
    enabled: !!clubId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AssociationTenantContext> => {
      const { data: club, error } = await fromExt("clubs")
        .select("id, name, tenant_type")
        .eq("id", clubId as string)
        .maybeSingle();
      if (error) throw error;
      if (!club || (club as any).tenant_type !== "association") return EMPTY;

      const [affRes, laRes] = await Promise.all([
        (supabase as any).rpc("association_structure_clubs", { _tenant_id: clubId as string }),
        fromExt("league_associations")
          .select("id")
          .eq("tenant_association_id", clubId as string),
      ]);

      const clubs = new Map<string, string>();
      // Clubs come from the national structure (single source of truth).
      ((affRes.data || []) as any[]).forEach((row) => {
        if (row?.club_id && row.tenant_type !== "association") clubs.set(row.club_id, row.name || "Club");
      });

      if (laRes.error) throw laRes.error;
      const leagueIds = ((laRes.data || []) as { id: string }[]).map((row) => row.id);
      let orgId: string | null = null;
      if (leagueIds.length) {
        const { data: orgs, error: orgError } = await fromExt("organisations")
          .select("id, kind, league_association_id")
          .eq("active", true)
          .in("league_association_id", leagueIds);
        if (orgError) throw orgError;
        orgId = associationOrgForTenant(leagueIds, (orgs || []) as { id: string; kind: string; league_association_id: string | null }[]);
      }

      // Junior bodies (zones/provincials) have no league association: their workspace is linked by organisations.club_id.
      if (!orgId) {
        const { data: linked } = await fromExt("organisations")
          .select("id, kind")
          .eq("active", true)
          .eq("club_id", clubId as string);
        const rows = (linked || []) as { id: string; kind: string }[];
        orgId = (rows.find((o) => o.kind === "zone" || o.kind === "provincial") ?? rows.find((o) => o.kind !== "club") ?? rows[0])?.id ?? null;
      }

      return {
        isAssociation: true,
        name: (club as any).name ?? null,
        orgId,
        clubs: Array.from(clubs.entries())
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    },
  });

  return { ...(data ?? EMPTY), isResolved: !clubId || isFetched };
}
