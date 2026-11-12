import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import type { FeeTiers } from "@/lib/tournaments/entry-fee";

/** Package prices by number of categories, or null when the tournament doesn't use them. */
export function useChampFeeTiers(champId: string | null | undefined): FeeTiers | null {
  const { data } = useQuery({
    queryKey: ["champ-fee-tiers", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("tournaments").select("entry_fee_basis, entry_fee_tiers").eq("id", champId!).maybeSingle();
      if (error) throw error;
      const row = data as { entry_fee_basis?: string | null; entry_fee_tiers?: FeeTiers | null } | null;
      return row?.entry_fee_basis === "tiered" && row.entry_fee_tiers ? row.entry_fee_tiers : null;
    },
    enabled: !!champId,
  });
  return data ?? null;
}
