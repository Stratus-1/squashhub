import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TournamentGovernance {
  sanction_status: "none" | "pending" | "approved" | "rejected";
  sanctioning_org_id: string | null;
  sanction_reference: string | null;
  sanction_notes: string | null;
  competition_level: "club" | "regional" | "provincial" | "national";
  eligibility_min_age: number | null;
  eligibility_max_age: number | null;
  eligibility_requires_licence: boolean;
  eligibility_scope: "club" | "association" | "open";
  eligibility_notes: string | null;
  entry_fee_cents: number;
  federation_fee_cents: number;
  association_fee_cents: number;
  refund_policy: "none" | "full_before_cutoff" | "partial_before_cutoff";
  refund_cutoff_date: string | null;
}

const FIELDS = [
  "sanction_status",
  "sanctioning_org_id",
  "sanction_reference",
  "sanction_notes",
  "competition_level",
  "eligibility_min_age",
  "eligibility_max_age",
  "eligibility_requires_licence",
  "eligibility_scope",
  "eligibility_notes",
  "entry_fee_cents",
  "federation_fee_cents",
  "association_fee_cents",
  "refund_policy",
  "refund_cutoff_date",
].join(", ");

/** Governance settings for a single tournament. */
export function useTournamentGovernance(champId: string | null) {
  return useQuery({
    queryKey: ["tournament-governance", champId],
    enabled: !!champId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("club_champs")
        .select(FIELDS)
        .eq("id", champId)
        .maybeSingle();
      if (error) throw error;
      return data as TournamentGovernance | null;
    },
  });
}

/** Sanctioning authorities: national bodies and associations. */
export function useSanctioningAuthorities() {
  return useQuery({
    queryKey: ["sanctioning-authorities"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("organisations")
        .select("id, name, kind, abbreviation")
        .in("kind", ["national", "association"])
        .eq("active", true)
        .order("kind")
        .order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string; kind: string; abbreviation: string | null }[];
    },
  });
}

export function useSaveTournamentGovernance(champId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<TournamentGovernance>) => {
      const { error } = await (supabase as any).from("club_champs").update(patch).eq("id", champId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tournament-governance", champId] });
      qc.invalidateQueries({ queryKey: ["tournament-governance-audit", champId] });
      qc.invalidateQueries({ queryKey: ["club-champs"] });
    },
  });
}

export interface GovernanceAuditRow {
  id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  created_at: string;
}

export function useTournamentGovernanceAudit(champId: string | null) {
  return useQuery({
    queryKey: ["tournament-governance-audit", champId],
    enabled: !!champId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tournament_governance_audit")
        .select("id, field, old_value, new_value, changed_by, created_at")
        .eq("champ_id", champId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as GovernanceAuditRow[];
    },
  });
}
