import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type OrgAdminRole =
  | "super_admin"
  | "competition_admin"
  | "finance_admin"
  | "association_admin"
  | "tournament_director"
  | "league_admin"
  | "referee";

export const ORG_ADMIN_ROLES: { value: OrgAdminRole; label: string; description: string }[] = [
  { value: "association_admin", label: "Association admin", description: "Full control of this association" },
  { value: "finance_admin", label: "Finance admin", description: "Fees, payouts and financial settings" },
  { value: "competition_admin", label: "Competition admin", description: "Leagues, fixtures and results" },
  { value: "tournament_director", label: "Tournament director", description: "Create and run tournaments" },
  { value: "league_admin", label: "League admin", description: "Manage league setup and lineups" },
  { value: "referee", label: "Referee", description: "Officiate and mark matches" },
];

export interface OrgSettings {
  org_id: string;
  default_entry_fee_cents: number;
  default_federation_fee_cents: number;
  default_association_fee_cents: number;
  default_host_share_pct: number;
  require_sanctioning: boolean;
  require_competitive_licence: boolean;
  payout_reference: string | null;
  finance_contact_name: string | null;
  finance_contact_email: string | null;
  notes: string | null;
}

export const emptyOrgSettings = (orgId: string): OrgSettings => ({
  org_id: orgId,
  default_entry_fee_cents: 0,
  default_federation_fee_cents: 0,
  default_association_fee_cents: 0,
  default_host_share_pct: 0,
  require_sanctioning: false,
  require_competitive_licence: false,
  payout_reference: null,
  finance_contact_name: null,
  finance_contact_email: null,
  notes: null,
});

/** Fee defaults and rules for a single organisation (federation or association). */
export function useOrgSettings(orgId: string | null) {
  return useQuery({
    queryKey: ["org-settings", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<OrgSettings> => {
      const { data, error } = await supabase
        .from("organisation_settings")
        .select("*")
        .eq("org_id", orgId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return emptyOrgSettings(orgId!);
      return {
        ...(data as any),
        default_host_share_pct: Number((data as any).default_host_share_pct || 0),
      } as OrgSettings;
    },
  });
}

export function useSaveOrgSettings(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: OrgSettings) => {
      if (!orgId) throw new Error("No organisation selected");
      const { error } = await supabase
        .from("organisation_settings")
        .upsert({ ...values, org_id: orgId } as any, { onConflict: "org_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-settings", orgId] });
      toast.success("Association settings saved");
    },
    onError: (e: any) => toast.error(e.message || "Could not save settings"),
  });
}

export interface OrgAdminRow {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgAdminRole;
  active: boolean;
  notes: string | null;
  created_at: string;
  name: string;
  email: string | null;
}

/** Admins scoped to a single organisation, with their profile details. */
export function useOrgAdmins(orgId: string | null) {
  return useQuery({
    queryKey: ["org-admins", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<OrgAdminRow[]> => {
      const { data, error } = await supabase
        .from("organisation_admins")
        .select("id, org_id, user_id, role, active, notes, created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data || []) as any[];
      if (!rows.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", rows.map((r) => r.user_id));
      const byId = new Map((profiles || []).map((p: any) => [p.id, p]));
      return rows.map((r) => ({
        ...r,
        name: byId.get(r.user_id)?.name || "Unknown user",
        email: byId.get(r.user_id)?.email ?? null,
      })) as OrgAdminRow[];
    },
  });
}

export function useGrantOrgAdmin(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: OrgAdminRole }) => {
      if (!orgId) throw new Error("No organisation selected");
      const clean = email.trim().toLowerCase();
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", clean)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) throw new Error("No SquashHub account found with that email address");
      const { error } = await supabase
        .from("organisation_admins")
        .upsert(
          { org_id: orgId, user_id: (profile as any).id, role, active: true } as any,
          { onConflict: "org_id,user_id,role" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-admins", orgId] });
      qc.invalidateQueries({ queryKey: ["federation-admins"] });
      toast.success("Access granted");
    },
    onError: (e: any) => toast.error(e.message || "Could not grant access"),
  });
}

export function useUpdateOrgAdmin(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("organisation_admins").update({ active } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-admins", orgId] }),
    onError: (e: any) => toast.error(e.message || "Could not update access"),
  });
}

export function useRevokeOrgAdmin(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("organisation_admins").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-admins", orgId] });
      toast.success("Access removed");
    },
    onError: (e: any) => toast.error(e.message || "Could not remove access"),
  });
}
