import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MemberCreditSettings = {
  default_amount: number;
  override_amount: number | null;
  credit_allowed: number;
  can_edit: boolean;
};

export function useMemberCredit(clubId?: string | null, memberId?: string | null) {
  return useQuery({
    queryKey: ["member-credit-allowance", clubId, memberId ?? null],
    enabled: !!clubId,
    refetchOnWindowFocus: true,
    staleTime: 0,
    queryFn: async () => {
      if (!clubId) throw new Error("Select a club");
      const { data, error } = await supabase.rpc("member_credit_settings", {
        _club_id: clubId, _club_member_id: memberId ?? null,
      });
      if (error) throw error;
      return data as unknown as MemberCreditSettings;
    },
  });
}

export function useSaveMemberCredit(clubId: string, memberId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (amount: number | null) => {
      const { data, error } = await supabase.rpc("set_member_credit_allowed", {
        _club_id: clubId, _club_member_id: memberId ?? null, _amount: amount,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      for (const key of ["member-credit-allowance", "account-booking-gate", "bar-account-charge-preview"]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}