import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface LeagueRules {
  id: string;
  league_id: string | null;
  association_id: string | null;
  club_id: string | null;
  points_per_game: number;
  win_by: number;
  games_format: "best_of_3" | "best_of_5" | "best_of_7";
  tiebreak_at: number | null;
  let_stroke_enabled: boolean;
  max_timeouts_per_player: number;
  marker_required: boolean;
  marker_must_be_qualified: boolean;
  forfeit_allowed: boolean;
  tiebreak_method: "games_then_points_then_share" | "games_only" | "points_only";
  bonus_points_mode: "none" | "per_match" | "per_game_won";
  bonus_points_value: number;
  share_bonus_on_tie: boolean;
  notes: string | null;
  // Substitution rules (added 2026-05-08)
  enforce_sub_rules: boolean;
  max_position_movement_per_week: number | null;
  sub_direction: "any" | "lower_or_equal_only" | "higher_or_equal_only";
  cross_gender_subs_allowed: boolean;
}

export function useAssociationRules(associationId: string | null | undefined) {
  return useQuery({
    queryKey: ["association-rules", "direct", associationId],
    enabled: !!associationId,
    queryFn: async () => {
      // Association rules are authored once in Super Admin against the platform
      // association. Callers must pass that association id directly.
      const { data, error } = await supabase
        .from("league_rules")
        .select("*")
        .eq("association_id", associationId!)
        .maybeSingle();
      if (error) throw error;
      return (data as LeagueRules | null) ?? null;
    },
  });
}

export function useUpdateAssociationRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { associationId: string; patch: Partial<LeagueRules> }) => {
      const { associationId, patch } = input;
      const { data: existing } = await supabase
        .from("league_rules")
        .select("id")
        .eq("association_id", associationId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("league_rules")
          .update(patch)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("league_rules")
          .insert({ association_id: associationId, ...patch });
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["association-rules", vars.associationId] });
      toast.success("Rules saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save rules"),
  });
}

export function useAssociationPenalties(associationId: string | null | undefined) {
  return useQuery({
    queryKey: ["association-penalties", associationId],
    enabled: !!associationId,
    queryFn: async () => {
      // Penalties are stored per fixture; join via leagues belonging to this association
      const { data: leagueRows } = await supabase
        .from("leagues")
        .select("id")
        .eq("association_id", associationId!);
      const leagueIds = (leagueRows ?? []).map((l: any) => l.id);
      if (leagueIds.length === 0) return [];
      const { data, error } = await supabase
        .from("league_fixture_penalties")
        .select("*")
        .in("league_id", leagueIds)
        .order("scraped_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
