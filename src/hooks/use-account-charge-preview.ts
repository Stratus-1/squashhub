import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { previewBasketCharge } from "@/lib/account-charge-gate";

/** Club switches + member owing/allowance for the early basket warning. Fails open (no warning) on error. */
export function useAccountChargePreview(clubMemberId: string | null | undefined, lines: { division?: string | null; total: number }[]) {
  const { data } = useQuery({
    queryKey: ["bar-account-charge-preview", clubMemberId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("bar_account_charge_preview", { _club_member_id: clubMemberId });
      if (error) return null;
      return (Array.isArray(data) ? data[0] : data) ?? null;
    },
    enabled: !!clubMemberId,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });
  return previewBasketCharge({ preview: data, lines });
}
