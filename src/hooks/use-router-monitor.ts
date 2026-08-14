import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";

const MB = 1024 * 1024;

export interface RouterConfig {
  id: string;
  club_id: string;
  enabled: boolean;
  driver: string;
  model: string | null;
  host: string | null;
  port: number | null;
  use_https: boolean;
  poll_interval_minutes: number;
  notes: string | null;
  last_polled_at: string | null;
  last_status: Record<string, any>;
}

export interface DataBundle {
  id: string;
  club_id: string;
  size_mb: number;
  purchased_at: string;
  cost: number | null;
  baseline_bytes: number;
  used_bytes: number;
  is_active: boolean;
  archived_at: string | null;
  notes: string | null;
}

/** Router driver registry mirror — keep in sync with the edge function. */
export const ROUTER_DRIVERS = [
  { id: "generic_http", label: "Generic HTTP / JSON endpoint" },
  { id: "mikrotik_rest", label: "MikroTik RouterOS (REST)" },
  { id: "huawei_hilink", label: "Huawei HiLink (LTE)" },
  { id: "glinet_luci", label: "GL.iNet / OpenWrt (LuCI)" },
];

export function useRouterConfig(clubId?: string) {
  return useQuery({
    enabled: !!clubId,
    queryKey: ["router-config", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_router_configs")
        .select("*")
        .eq("club_id", clubId)
        .maybeSingle();
      if (error) throw error;
      return (data as RouterConfig) ?? null;
    },
  });
}

export function useActiveBundle(clubId?: string) {
  return useQuery({
    enabled: !!clubId,
    queryKey: ["router-active-bundle", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_data_bundles")
        .select("*")
        .eq("club_id", clubId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return (data as DataBundle) ?? null;
    },
  });
}

export function useBundleHistory(clubId?: string) {
  return useQuery({
    enabled: !!clubId,
    queryKey: ["router-bundle-history", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_data_bundles")
        .select("*")
        .eq("club_id", clubId)
        .order("purchased_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as DataBundle[]) ?? [];
    },
  });
}

export function useRecentPolls(clubId?: string, limit = 25) {
  return useQuery({
    enabled: !!clubId,
    queryKey: ["router-polls", clubId, limit],
    queryFn: async () => {
      const { data, error } = await fromExt("club_router_polls")
        .select("*")
        .eq("club_id", clubId)
        .order("polled_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export interface BundleUsage {
  sizeMb: number;
  usedMb: number;
  remainingMb: number;
  percentUsed: number;
  dailyMb: number | null;
  daysLeft: number | null;
  daysElapsed: number;
}

export function computeUsage(bundle: DataBundle | null | undefined): BundleUsage | null {
  if (!bundle) return null;
  const sizeMb = Number(bundle.size_mb) || 0;
  const usedMb = Number(bundle.used_bytes || 0) / MB;
  const remainingMb = Math.max(0, sizeMb - usedMb);
  const percentUsed = sizeMb > 0 ? Math.min(100, (usedMb / sizeMb) * 100) : 0;
  const purchased = new Date(bundle.purchased_at + "T00:00:00");
  const daysElapsed = Math.max(
    1,
    Math.ceil((Date.now() - purchased.getTime()) / 86_400_000),
  );
  const dailyMb = usedMb > 0 ? usedMb / daysElapsed : null;
  const daysLeft = dailyMb && dailyMb > 0 ? Math.floor(remainingMb / dailyMb) : null;
  return { sizeMb, usedMb, remainingMb, percentUsed, dailyMb, daysLeft, daysElapsed };
}

export function formatData(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(0)} MB`;
}

export function formatUptime(seconds?: number | null) {
  if (!seconds && seconds !== 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}
