import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";

export interface ClubSecrets {
  id: string;
  club_id: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_pass?: string;
  sender_email?: string;
  sender_name?: string;
  payment_gateway_secret_key?: string;
  payment_gateway_credentials?: Record<string, string>;
  shelly_auth_key?: string;
  shelly_server_url?: string;
  shelly_door_device_id?: string;
  shelly_door_channel?: number;
  shelly_door_pulse_ms?: number;
  shelly_door_ble_mac?: string;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  bank_branch_code?: string;
  bank_reference?: string;
}

/** Fetch sensitive club settings (admin-only via RLS) */
export function useClubSecrets(clubId?: string) {
  return useQuery({
    queryKey: ["club-secrets", clubId],
    queryFn: async () => {
      // Admins see the full row via RLS.
      const { data, error } = await fromExt("club_secrets")
        .select("*")
        .eq("club_id", clubId!)
        .maybeSingle();
      if (error) throw error;
      if (data) return data as ClubSecrets | null;

      // Regular members get only the safe subset (door/relay + banking details).
      const { data: safe } = await (supabase as any).rpc("get_club_member_config", {
        _club_id: clubId!,
      });
      const row = Array.isArray(safe) ? safe[0] : safe;
      return (row ?? null) as ClubSecrets | null;

    },
    enabled: !!clubId,
  });

}

/** Upsert club secrets */
export function useUpdateClubSecrets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ club_id, ...updates }: Partial<ClubSecrets> & { club_id: string }) => {
      // Try update first
      const { data: existing } = await fromExt("club_secrets")
        .select("id")
        .eq("club_id", club_id)
        .maybeSingle();

      if (existing) {
        const { data, error } = await fromExt("club_secrets")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("club_id", club_id)
          .select()
          .single();
        if (error) throw error;
        return data as ClubSecrets;
      } else {
        const { data, error } = await fromExt("club_secrets")
          .insert({ club_id, ...updates })
          .select()
          .single();
        if (error) throw error;
        return data as ClubSecrets;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["club-secrets", vars.club_id] });
    },
  });
}
