import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { fromExt } from "@/lib/supabase-ext";
import { useMemberCredit } from "@/hooks/use-member-credit";

export const MIN_BOOKING_BALANCE_KEY = "club-min-booking-balance";
const money = (n: number) => `R${Number(n).toFixed(2)}`;

/** Read-only, club-scoped cross-reference shown beside the Member Credit default editor. */
export function MinBookingBalanceNote({ clubId }: { clubId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: [MIN_BOOKING_BALANCE_KEY, clubId],
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await fromExt("clubs").select("min_booking_balance").eq("id", clubId).maybeSingle();
      if (error) throw error;
      return { value: (data as any)?.min_booking_balance as number | null };
    },
  });
  if (isLoading || error || !data) return null;
  return (
    <p className="flex items-start gap-1 text-[11px] leading-snug text-muted-foreground" data-testid="min-booking-balance-note">
      <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      <span>
        {data.value === null
          ? "Minimum account balance for court bookings: not set (any active member can book)."
          : `Minimum account balance required for court bookings: ${money(data.value)}.`}{" "}
        Credit allowances are taken into account: a member may book when balance + credit allowed ≥ the minimum. An individual member override takes precedence over this default.
      </span>
    </p>
  );
}

/** Read-only, club-scoped cross-reference shown beside the minimum booking balance editor. */
export function DefaultCreditNote({ clubId }: { clubId: string }) {
  const { data, isLoading, error } = useMemberCredit(clubId, null);
  if (isLoading || error || !data) return null;
  return (
    <p className="flex items-start gap-1 text-[11px] leading-snug text-muted-foreground" data-testid="default-credit-note">
      <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      <span>
        Default member credit allowance: {money(data.default_amount)}. Individual member overrides may differ and take precedence. Approved credit is taken into account when checking booking eligibility (balance + credit allowed ≥ minimum).
      </span>
    </p>
  );
}
