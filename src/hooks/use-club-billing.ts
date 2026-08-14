import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";

export interface ClubBillingProfile {
  id?: string;
  club_id: string;
  contact_name: string | null;
  company_name: string | null;
  emails: string[];
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  vat_number: string | null;
  po_number: string | null;
  updated_at?: string;
}

export const BILLING_FIELD_LABELS: Record<string, string> = {
  contact_name: "Billing contact name",
  company_name: "Company / legal entity",
  emails: "Billing emails",
  phone: "Phone",
  address_line1: "Address line 1",
  address_line2: "Address line 2",
  city: "City",
  province: "Province / State",
  postal_code: "Postal code",
  country: "Country",
  vat_number: "VAT / Tax number",
  po_number: "PO number",
};

export function useClubBillingProfile(clubId?: string) {
  return useQuery({
    queryKey: ["club-billing-profile", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await fromExt("club_billing_profiles")
        .select("*")
        .eq("club_id", clubId!)
        .maybeSingle();
      if (error) throw error;
      return (data as ClubBillingProfile | null) ?? null;
    },
  });
}

export interface BillingAuditRow {
  id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by_name: string | null;
  created_at: string;
}

export function useClubBillingAudit(clubId?: string) {
  return useQuery({
    queryKey: ["club-billing-audit", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await fromExt("club_billing_audit")
        .select("id, field, old_value, new_value, changed_by_name, created_at")
        .eq("club_id", clubId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as BillingAuditRow[];
    },
  });
}

const asText = (v: any) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v));

/** Save the billing profile and write an audit entry for every changed field. */
export function useSaveClubBillingProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clubId,
      values,
      previous,
      actorName,
    }: {
      clubId: string;
      values: Partial<ClubBillingProfile>;
      previous: ClubBillingProfile | null;
      actorName: string;
    }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id ?? null;

      let saved: any;
      if (previous?.id) {
        const { data, error } = await fromExt("club_billing_profiles")
          .update(values)
          .eq("club_id", clubId)
          .select()
          .single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await fromExt("club_billing_profiles")
          .insert({ club_id: clubId, ...values })
          .select()
          .single();
        if (error) throw error;
        saved = data;
      }

      const changes = Object.keys(BILLING_FIELD_LABELS)
        .filter((f) => asText((values as any)[f]) !== asText((previous as any)?.[f]))
        .map((f) => ({
          club_id: clubId,
          field: f,
          old_value: asText((previous as any)?.[f]) || null,
          new_value: asText((values as any)[f]) || null,
          changed_by: uid,
          changed_by_name: actorName || null,
        }));

      if (changes.length) {
        await fromExt("club_billing_audit").insert(changes);
      }
      return saved as ClubBillingProfile;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["club-billing-profile", vars.clubId] });
      qc.invalidateQueries({ queryKey: ["club-billing-audit", vars.clubId] });
    },
  });
}

/** Members holding the "finance" permission — used to pre-fill billing contacts. */
export function useFinanceContacts(clubId?: string) {
  return useQuery({
    queryKey: ["finance-permission-contacts", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await fromExt("club_member_permissions")
        .select("custom_permissions, is_full_admin, club_permission_roles(permissions, is_full_admin), club_members!inner(id, name, email, phone, club_id)")
        .eq("club_members.club_id", clubId!);
      if (error) throw error;
      return (data || [])
        .filter((r: any) => {
          const custom: string[] = r.custom_permissions || [];
          const rolePerms: string[] = r.club_permission_roles?.permissions || [];
          return custom.includes("finance") || rolePerms.includes("finance") || r.is_full_admin || r.club_permission_roles?.is_full_admin;
        })
        .map((r: any) => ({
          id: r.club_members?.id as string,
          name: (r.club_members?.name as string) || "",
          email: (r.club_members?.email as string) || "",
          phone: (r.club_members?.phone as string) || "",
        }))
        .filter((m: any) => m.id);
    },
  });
}
