import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeSpendSummary } from "@/lib/account-charge-gate";

/** Read-only composition of the existing booking-eligibility and bar-preview checks. Fails closed to hidden. */
export function useSpendSummary(clubId?: string | null, memberId?: string | null) {
  return useQuery({
    queryKey: ["member-spend-summary", clubId, memberId],
    enabled: !!clubId && !!memberId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [elig, bar, club] = await Promise.all([
        supabase.rpc("member_booking_eligibility", { _club_id: clubId!, _club_member_id: memberId!, _extra: 0 }),
        (supabase as any).rpc("bar_account_charge_preview", { _club_member_id: memberId }),
        (supabase as any).from("clubs").select("min_booking_balance").eq("id", clubId).maybeSingle(),
      ]);
      if (elig.error) throw elig.error;
      const e = elig.data as any;
      const p = bar.error ? null : (Array.isArray(bar.data) ? bar.data[0] : bar.data);
      const min = club.data?.min_booking_balance;
      return computeSpendSummary({
        currentOwing: Number(e?.currentOwing ?? 0),
        mandateAllowance: Number(e?.planAllowedDebt ?? 0),
        approvedCredit: Number(e?.approvedCredit ?? 0),
        bookingMin: min == null ? null : Number(min),
        barGated: !!(p?.bar_gated || p?.shop_gated),
      });
    },
  });
}
