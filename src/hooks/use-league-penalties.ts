import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt, rpcExt } from "@/lib/supabase-ext";
import type { TeamPenalty } from "@/lib/leagues/team-penalties";

export interface PenaltyRule {
  id: string; association_id: string; name: string; description: string | null;
  default_points: number; is_active: boolean; updated_at: string;
}
export interface TeamPenaltyRow extends TeamPenalty {
  association_id: string; rule_id: string | null; season_year: number;
  applied_by: string; reversed_by: string | null; reversal_reason: string | null;
}

export function usePenaltyRules(associationId: string | null | undefined) {
  return useQuery({
    queryKey: ["league-penalty-rules", associationId],
    enabled: !!associationId,
    queryFn: async () => {
      const { data, error } = await fromExt("league_penalty_rules").select("*")
        .eq("association_id", associationId).order("name");
      if (error) throw error;
      return (data ?? []) as PenaltyRule[];
    },
  });
}

export function useTeamPenalties(associationId: string | null | undefined, opts?: { fixtureId?: string | null }) {
  return useQuery({
    queryKey: ["league-team-penalties", associationId, opts?.fixtureId ?? null],
    enabled: !!associationId,
    queryFn: async () => {
      let q = fromExt("league_team_penalties").select("*").eq("association_id", associationId);
      if (opts?.fixtureId) q = q.eq("fixture_id", opts.fixtureId);
      const { data, error } = await q.order("applied_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TeamPenaltyRow[];
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["league-penalty-rules"] });
    qc.invalidateQueries({ queryKey: ["league-team-penalties"] });
  };
}

export function useSavePenaltyRule() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (v: { associationId: string; id?: string | null; name: string; description?: string; defaultPoints: number; isActive: boolean }) => {
      const { error } = await rpcExt("league_penalty_rule_save", {
        _association_id: v.associationId, _rule_id: v.id ?? null, _name: v.name,
        _description: v.description ?? null, _default_points: v.defaultPoints, _is_active: v.isActive,
      });
      if (error) throw error;
    },
    onSuccess: inv,
  });
}

export function useApplyTeamPenalty() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (v: { associationId: string; teamCode: string; ruleId: string; points: number | null; reason: string; fixtureId?: string | null; seasonId?: string | null; effectiveDate?: string | null }) => {
      const { error } = await rpcExt("league_apply_team_penalty", {
        _association_id: v.associationId, _team_code: v.teamCode, _rule_id: v.ruleId,
        _points: v.points, _reason: v.reason, _fixture_id: v.fixtureId ?? null,
        _season_id: v.seasonId ?? null, _effective_date: v.effectiveDate ?? null,
      });
      if (error) throw error;
    },
    onSuccess: inv,
  });
}

export function useReverseTeamPenalty() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (v: { id: string; reason: string }) => {
      const { error } = await rpcExt("league_reverse_team_penalty", { _penalty_id: v.id, _reason: v.reason });
      if (error) throw error;
    },
    onSuccess: inv,
  });
}
