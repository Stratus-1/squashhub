import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { useMyClub } from "@/hooks/use-club";
import {
  type Capability,
  CAPABILITY_LIST,
  DEFAULT_CAPABILITIES,
  withDependencies,
  dependentsOf,
} from "@/lib/capabilities";

export interface ClubCapabilityRow {
  id: string;
  club_id: string;
  capability: string;
  enabled: boolean;
  enabled_at: string | null;
  disabled_at: string | null;
}

/** Raw capability rows for a club. */
export function useClubCapabilityRows(clubId?: string) {
  return useQuery({
    queryKey: ["club-capabilities", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_capabilities")
        .select("*")
        .eq("club_id", clubId!);
      if (error) throw error;
      return (data || []) as ClubCapabilityRow[];
    },
    enabled: !!clubId,
    staleTime: 60_000,
  });
}

/**
 * Set of enabled capability slugs for the active club.
 *
 * Fail-open while loading or when no rows exist at all (mirrors the
 * `club_has_capability` SQL helper) so nothing disappears mid-flight for
 * tenants that have not been backfilled.
 */
export function useCapabilities(clubIdOverride?: string): {
  enabled: Set<string>;
  isLoading: boolean;
  hasRows: boolean;
  clubId?: string;
} {
  const { club: contextClub } = useClubContext();
  const { data: clubData } = useMyClub();
  const clubId = clubIdOverride || clubData?.club?.id || (contextClub as any)?.id;
  const { data: rows, isLoading } = useClubCapabilityRows(clubId);

  const hasRows = (rows?.length ?? 0) > 0;
  if (!hasRows) {
    // Unknown state -> assume everything is available (never hide a live feature).
    return {
      enabled: new Set(CAPABILITY_LIST.map((c) => c.slug as string)),
      isLoading,
      hasRows: false,
      clubId,
    };
  }
  return {
    enabled: new Set(rows!.filter((r) => r.enabled).map((r) => r.capability)),
    isLoading,
    hasRows: true,
    clubId,
  };
}

/** Whether one capability is on for the active club. */
export function useHasCapability(slug: Capability, clubIdOverride?: string): boolean {
  const { enabled } = useCapabilities(clubIdOverride);
  return enabled.has(slug);
}

/**
 * Turn a capability on or off. Enabling pulls in required dependencies;
 * disabling also switches off anything that depends on it.
 * Disabling never deletes configuration or history — it only flips the flag.
 */
export function useSetCapability(clubId?: string) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ slug, enabled }: { slug: Capability; enabled: boolean }) => {
      if (!clubId) throw new Error("No club");
      const { data: rows } = await fromExt("club_capabilities")
        .select("capability, enabled")
        .eq("club_id", clubId);
      const current = new Set<string>(
        ((rows || []) as any[]).filter((r) => r.enabled).map((r) => String(r.capability))
      );

      const targets: Capability[] = enabled
        ? [...withDependencies(slug)]
        : [slug, ...dependentsOf(slug, current)];

      const now = new Date().toISOString();
      const payload = targets.map((cap) => ({
        club_id: clubId,
        capability: cap,
        enabled,
        enabled_at: enabled ? now : null,
        disabled_at: enabled ? null : now,
        enabled_by: user?.id ?? null,
      }));

      const { error } = await fromExt("club_capabilities").upsert(payload, {
        onConflict: "club_id,capability",
      });
      if (error) throw error;
      return targets;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club-capabilities", clubId] });
      qc.invalidateQueries({ queryKey: ["my-club"] });
      qc.invalidateQueries({ queryKey: ["admin-club"] });
      qc.invalidateQueries({ queryKey: ["club-secrets", clubId] });
    },
  });
}

/** Bulk-apply the Quick Setup answers in one write. */
export function useApplyQuickSetup(clubId?: string) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (chosen: Capability[]) => {
      if (!clubId) throw new Error("No club");
      const on = new Set<Capability>();
      chosen.forEach((c) => withDependencies(c, on));
      const now = new Date().toISOString();
      const payload = CAPABILITY_LIST.map((meta) => ({
        club_id: clubId,
        capability: meta.slug,
        enabled: on.has(meta.slug),
        enabled_at: on.has(meta.slug) ? now : null,
        disabled_at: on.has(meta.slug) ? null : now,
        enabled_by: user?.id ?? null,
      }));
      const { error } = await fromExt("club_capabilities").upsert(payload, {
        onConflict: "club_id,capability",
      });
      if (error) throw error;
      return [...on];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club-capabilities", clubId] });
      qc.invalidateQueries({ queryKey: ["my-club"] });
      qc.invalidateQueries({ queryKey: ["admin-club"] });
    },
  });
}

export { DEFAULT_CAPABILITIES };
