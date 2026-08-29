import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_LADDER_CONFIG, type LadderConfig } from "@/lib/ladder/eligibility";
import { toast } from "sonner";

function normalise(row: any): LadderConfig {
  if (!row) return DEFAULT_LADDER_CONFIG;
  const sizes = Array.isArray(row.pyramid_row_sizes)
    ? (row.pyramid_row_sizes as any[]).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 1)
    : null;
  return {
    id: row.id,
    club_id: row.club_id,
    format: row.format === "pyramid" ? "pyramid" : "standard",
    challenge_levels_up: Number(row.challenge_levels_up ?? 2),
    pyramid_row_sizes: sizes && sizes.length > 0 ? sizes : null,
    accept_deadline_hours: Number(row.accept_deadline_hours ?? 72),
    complete_deadline_days: Number(row.complete_deadline_days ?? 14),
    max_active_outgoing: Number(row.max_active_outgoing ?? 1),
    max_active_incoming: Number(row.max_active_incoming ?? 1),
    rematch_cooldown_days: Number(row.rematch_cooldown_days ?? 0),
    movement_policy: row.movement_policy === "insert" ? "insert" : "swap",
    affects_club_ranking: !!row.affects_club_ranking,
    ranking_sync_mode:
      row.ranking_sync_mode === "mirror" ? "mirror" : row.ranking_sync_mode === "none" ? "none" : "formula",
    ranking_mirror_margin: Number(row.ranking_mirror_margin ?? 1),
    ranking_auto_approve: !!row.ranking_auto_approve,
    ladder_from_leagues: row.ladder_from_leagues !== false,
    ladder_from_tournaments: row.ladder_from_tournaments !== false,
    league_movement_policy:
      row.league_movement_policy === "swap" || row.league_movement_policy === "insert"
        ? row.league_movement_policy
        : null,
    tournament_movement_policy:
      row.tournament_movement_policy === "swap" || row.tournament_movement_policy === "insert"
        ? row.tournament_movement_policy
        : null,
    is_active: row.is_active !== false,
  };
}

/** Club ladder & challenge configuration. Falls back to safe defaults. */
export function useLadderConfig(clubId?: string | null) {
  return useQuery({
    queryKey: ["ladder-config", clubId],
    enabled: !!clubId,
    staleTime: 60_000,
    queryFn: async (): Promise<LadderConfig> => {
      const { data, error } = await (supabase as any)
        .from("ladder_configs")
        .select("*")
        .eq("club_id", clubId)
        .maybeSingle();
      if (error) throw error;
      return normalise(data);
    },
  });
}

export function useUpdateLadderConfig(clubId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<LadderConfig>) => {
      if (!clubId) throw new Error("No club selected");
      const { error } = await (supabase as any)
        .from("ladder_configs")
        .upsert({ club_id: clubId, ...patch }, { onConflict: "club_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ladder-config", clubId] });
      toast.success("Ladder settings saved");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save ladder settings"),
  });
}
