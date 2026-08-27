/**
 * Resolve the platform-level league association behind an association tenant.
 *
 * The association tenant (a `clubs` row with tenant_type='association') mirrors
 * a `platform_league_associations` row through `league_associations`. Rules,
 * fixtures and external (NSA) sync all live on that platform row — it is the
 * single source of truth, now surfaced inside the association tenant instead of
 * Super Admin.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformAssociation {
  id: string;
  name: string;
  external_source: string | null;
  external_season: string | null;
  last_fixtures_sync_at: string | null;
  last_fixtures_sync_summary: string | null;
  season_year: number | null;
}

export function usePlatformAssociation(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["platform-association-for-tenant", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<PlatformAssociation | null> => {
      let platformId: string | null = null;

      const { data: linked } = await supabase
        .from("league_associations")
        .select("platform_association_id")
        .eq("tenant_association_id", tenantId!)
        .not("platform_association_id", "is", null)
        .limit(1);
      platformId = (linked?.[0]?.platform_association_id as string | undefined) ?? null;

      if (!platformId) {
        // Fallback: match by tenant name (older tenants have no explicit link).
        const { data: tenant } = await supabase
          .from("clubs")
          .select("name")
          .eq("id", tenantId!)
          .maybeSingle();
        if (tenant?.name) {
          const { data: byName } = await supabase
            .from("platform_league_associations")
            .select("id")
            .eq("name", tenant.name)
            .limit(1);
          platformId = (byName?.[0]?.id as string | undefined) ?? null;
        }
      }

      if (!platformId) return null;

      const { data } = await supabase
        .from("platform_league_associations")
        .select("id, name, external_source, external_season, last_fixtures_sync_at, last_fixtures_sync_summary, season_year")
        .eq("id", platformId)
        .maybeSingle();
      return (data as PlatformAssociation | null) ?? null;
    },
  });
}
