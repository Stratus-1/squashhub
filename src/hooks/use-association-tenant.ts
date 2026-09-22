import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";

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
export function useAssociationTenant(clubId: string | null | undefined): AssociationTenantContext {
  const { data } = useQuery({
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
        fromExt("association_affiliated_clubs")
          .select("club_id, status, clubs:club_id(id, name)")
          .eq("association_tenant_id", clubId as string),
        fromExt("league_associations")
          .select("id")
          .eq("tenant_association_id", clubId as string)
          .limit(1),
      ]);

      const clubs = new Map<string, string>();
      ((affRes.data || []) as any[]).forEach((row) => {
        if (row.status && row.status !== "active") return;
        const c = row.clubs;
        if (c?.id) clubs.set(c.id, c.name || "Club");
      });

      let orgId: string | null = null;
      const laId = ((laRes.data || []) as any[])[0]?.id;
      if (laId) {
        const { data: org } = await fromExt("organisations")
          .select("id")
          .eq("league_association_id", laId)
          .maybeSingle();
        orgId = (org as any)?.id ?? null;
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

  return data ?? EMPTY;
}
