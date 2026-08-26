import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt, rpcExt } from "@/lib/supabase-ext";
import {
  CLUB_DOCUMENTS_BUCKET,
  ClubMembershipRules,
  ClubRuleDocument,
  DEFAULT_ACCEPTANCE_STATEMENT,
} from "@/lib/club-rules";

const emptyRules = (clubId: string): ClubMembershipRules => ({
  club_id: clubId,
  rules_text: "",
  documents: [],
  show_on_landing: false,
  require_acceptance: true,
  acceptance_statement: DEFAULT_ACCEPTANCE_STATEMENT,
  current_version: 0,
});

/** Admin read of the club's rules row (creates nothing). */
export function useClubRules(clubId?: string) {
  return useQuery({
    queryKey: ["club-membership-rules", clubId],
    queryFn: async (): Promise<ClubMembershipRules> => {
      const { data, error } = await fromExt("club_membership_rules")
        .select("*")
        .eq("club_id", clubId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return emptyRules(clubId!);
      return { ...data, documents: (data.documents || []) as ClubRuleDocument[] };
    },
    enabled: !!clubId,
  });
}

export function useSaveClubRules(clubId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<ClubMembershipRules>) => {
      const { data: userRes } = await supabase.auth.getUser();
      const payload = {
        club_id: clubId,
        ...patch,
        updated_by: userRes?.user?.id ?? null,
      };
      const { error } = await fromExt("club_membership_rules")
        .upsert(payload, { onConflict: "club_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club-membership-rules", clubId] });
      qc.invalidateQueries({ queryKey: ["club-rule-versions", clubId] });
      qc.invalidateQueries({ queryKey: ["club-public-rules", clubId] });
      qc.invalidateQueries({ queryKey: ["club-member-rules", clubId] });
    },
  });
}

/** Version history (newest first). */
export function useClubRuleVersions(clubId?: string) {
  return useQuery({
    queryKey: ["club-rule-versions", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_membership_rule_versions")
        .select("id, version, rules_text, documents, created_at")
        .eq("club_id", clubId)
        .order("version", { ascending: false });
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        version: number;
        rules_text: string;
        documents: ClubRuleDocument[];
        created_at: string;
      }>;
    },
    enabled: !!clubId,
  });
}

/** Public (anonymous-safe) read — only returns rows flagged for the landing page. */
export function usePublicClubRules(clubId?: string) {
  return useQuery({
    queryKey: ["club-public-rules", clubId],
    queryFn: async () => {
      const { data, error } = await rpcExt("get_club_public_membership_rules", { _club_id: clubId });
      if (error) throw error;
      const row = (data || [])[0];
      if (!row) return null;
      return { ...row, documents: (row.documents || []) as ClubRuleDocument[] } as {
        rules_text: string;
        documents: ClubRuleDocument[];
        acceptance_statement: string;
        current_version: number;
      };
    },
    enabled: !!clubId,
  });
}

/** Signed-in member read — used during registration (independent of the landing toggle). */
export function useMemberClubRules(clubId?: string) {
  return useQuery({
    queryKey: ["club-member-rules", clubId],
    queryFn: async () => {
      const { data, error } = await rpcExt("get_club_membership_rules_for_member", { _club_id: clubId });
      if (error) throw error;
      const row = (data || [])[0];
      if (!row) return null;
      return { ...row, documents: (row.documents || []) as ClubRuleDocument[] } as {
        rules_text: string;
        documents: ClubRuleDocument[];
        acceptance_statement: string;
        require_acceptance: boolean;
        current_version: number;
      };
    },
    enabled: !!clubId,
  });
}

/** Audit trail of who accepted which version. */
export function useClubRuleAcceptances(clubId?: string) {
  return useQuery({
    queryKey: ["club-rule-acceptances", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_rule_acceptances")
        .select("id, user_id, club_member_id, version, statement, accepted_at")
        .eq("club_id", clubId)
        .order("accepted_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        user_id: string;
        club_member_id: string | null;
        version: number;
        statement: string;
        accepted_at: string;
      }>;
    },
    enabled: !!clubId,
  });
}

/** Store the audit record (timestamp + version + exact wording accepted). */
export async function recordRuleAcceptance(args: {
  clubId: string;
  userId: string;
  clubMemberId?: string | null;
  version: number;
  statement: string;
}) {
  const { error } = await fromExt("club_rule_acceptances").insert({
    club_id: args.clubId,
    user_id: args.userId,
    club_member_id: args.clubMemberId ?? null,
    version: args.version || 1,
    statement: args.statement,
  });
  if (error) throw error;
}

/** Documents live in a private bucket — resolve a temporary link on demand. */
export async function signRuleDocument(path: string, seconds = 60 * 60): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(CLUB_DOCUMENTS_BUCKET)
    .createSignedUrl(path, seconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}
