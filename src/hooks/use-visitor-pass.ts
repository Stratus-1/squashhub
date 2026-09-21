import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import type { VisitorPass, VisitorPassKind, VisitorPassOption } from "@/lib/visitor-pass";

/**
 * Visitor pass prices come from the club's Fee Structure — this hook never
 * stores or edits an amount of its own.
 */
export function useVisitorPassOptions(clubId?: string) {
  return useQuery({
    queryKey: ["visitor-pass-options", clubId],
    enabled: !!clubId,
    queryFn: async (): Promise<VisitorPassOption[]> => {
      const { data, error } = await fromExt("member_fee_categories")
        .select("id, name, annual_fee, active, visitor_pass_kind")
        .eq("club_id", clubId!)
        .not("visitor_pass_kind", "is", null);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        kind: r.visitor_pass_kind as VisitorPassKind,
        name: r.name,
        amount: Number(r.annual_fee || 0),
        active: !!r.active,
      }));
    },
  });
}

/** The visitor's own most recent pass (any state). */
export function useMyVisitorPass(clubMemberId?: string) {
  return useQuery({
    queryKey: ["my-visitor-pass", clubMemberId],
    enabled: !!clubMemberId,
    queryFn: async (): Promise<VisitorPass | null> => {
      const { data, error } = await fromExt("club_visitor_passes")
        .select("*")
        .eq("club_member_id", clubMemberId!)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data || [])[0] as unknown as VisitorPass) ?? null;
    },
  });
}

export function usePurchaseVisitorPass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { clubMemberId: string; kind: VisitorPassKind }) => {
      const { data, error } = await (supabase as any).rpc("visitor_purchase_pass", {
        p_club_member_id: vars.clubMemberId,
        p_pass_kind: vars.kind,
      });
      if (error) throw error;
      return data as VisitorPass;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["my-visitor-pass", vars.clubMemberId] });
      qc.invalidateQueries({ queryKey: ["club-visitor-passes"] });
      qc.invalidateQueries({ queryKey: ["member-fees"] });
    },
  });
}

/** Admin: every pass at the club, newest first. */
export function useClubVisitorPasses(clubId?: string) {
  return useQuery({
    queryKey: ["club-visitor-passes", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await fromExt("club_visitor_passes")
        .select("*, club_members:club_member_id(name, email, phone)")
        .eq("club_id", clubId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useDecideVisitorPass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { passId: string; approve: boolean; reason?: string }) => {
      const { data, error } = await (supabase as any).rpc("admin_decide_visitor_pass", {
        p_pass_id: vars.passId,
        p_approve: vars.approve,
        p_reason: vars.reason ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club-visitor-passes"] });
      qc.invalidateQueries({ queryKey: ["my-visitor-pass"] });
    },
  });
}
