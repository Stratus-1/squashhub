import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const OVERALL_CATEGORY = "ALL";

export interface RankingSnapshot {
  id: string;
  computed_at: string;
  basis_seasons: number[];
  player_count: number;
}

export interface RankingEntry {
  id: string;
  player_code: string;
  player_name: string | null;
  club_label: string | null;
  category: string;
  rank: number;
  previous_rank: number | null;
  score: number;
  rubbers_counted: number;
  season_breakdown: Record<string, { score: number; counted: number; played: number }>;
}

export interface NsaSyncRun {
  id: string;
  kind: string;
  season_code: string | null;
  season_year: number | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  seen_count: number;
  created_count: number;
  skipped_count: number;
  error_count: number;
}

/** Most recent ranking run for an association (null association = federation-wide). */
export function useLatestRankingSnapshot(associationId?: string | null) {
  return useQuery({
    queryKey: ["ranking-snapshot", associationId ?? null],
    queryFn: async (): Promise<RankingSnapshot | null> => {
      let q = supabase
        .from("ranking_snapshots")
        .select("id, computed_at, basis_seasons, player_count")
        .order("computed_at", { ascending: false })
        .limit(1);
      q = associationId ? q.eq("association_id", associationId) : q.is("association_id", null);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return (data as RankingSnapshot) ?? null;
    },
  });
}

export function useRankingEntries(snapshotId: string | undefined, category: string) {
  return useQuery({
    queryKey: ["ranking-entries", snapshotId, category],
    enabled: !!snapshotId,
    queryFn: async (): Promise<RankingEntry[]> => {
      const { data, error } = await supabase
        .from("ranking_snapshot_entries")
        .select(
          "id, player_code, player_name, club_label, category, rank, previous_rank, score, rubbers_counted, season_breakdown",
        )
        .eq("snapshot_id", snapshotId!)
        .eq("category", category)
        .order("rank", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as RankingEntry[];
    },
  });
}

export function useRankingCategories(snapshotId: string | undefined) {
  return useQuery({
    queryKey: ["ranking-categories", snapshotId],
    enabled: !!snapshotId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("ranking_snapshot_entries")
        .select("category")
        .eq("snapshot_id", snapshotId!)
        .limit(5000);
      if (error) throw error;
      const set = new Set((data ?? []).map((r: { category: string }) => r.category));
      return [...set].sort((a, b) => (a === OVERALL_CATEGORY ? -1 : b === OVERALL_CATEGORY ? 1 : a.localeCompare(b)));
    },
  });
}

/** A player's individual rubber-by-rubber points breakdown. */
export function usePlayerRankingBreakdown(playerCode: string | null) {
  return useQuery({
    queryKey: ["ranking-breakdown", playerCode],
    enabled: !!playerCode,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ranking_rubber_points")
        .select(
          "id, season_year, fixture_date, league_label, team_code, position, won, base_points, league_weight, position_weight, opponent_factor, points",
        )
        .eq("player_code", playerCode!)
        .order("fixture_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useNsaSyncRuns(limit = 10) {
  return useQuery({
    queryKey: ["nsa-sync-runs", limit],
    queryFn: async (): Promise<NsaSyncRun[]> => {
      const { data, error } = await supabase
        .from("nsa_sync_runs")
        .select(
          "id, kind, season_code, season_year, status, started_at, finished_at, seen_count, created_count, skipped_count, error_count",
        )
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as NsaSyncRun[];
    },
    refetchInterval: 15000,
  });
}

export function useRunNsaScrape() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { season?: string; full_season?: boolean; force?: boolean; lookback_days?: number }) => {
      const { data, error } = await supabase.functions.invoke("nsa-scrape-positions", {
        body: { background: true, ...payload },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nsa-sync-runs"] }),
  });
}

export function useRecomputeRankings(associationId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("compute-nsa-rankings", {
        body: { association_id: associationId ?? null },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ranking-snapshot"] });
      qc.invalidateQueries({ queryKey: ["ranking-entries"] });
      qc.invalidateQueries({ queryKey: ["ranking-categories"] });
    },
  });
}
