import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";

/**
 * The player's actual events (with per-event prices) and the authoritative total
 * they owe (own events + partner shares they cover), from the server.
 */
export function useChampEntrySummary(champ: any, registration: any, money: (cents: number) => string) {
  const champId = champ?.id as string | undefined;
  const memberId = registration?.club_member_id as string | undefined;
  const { data: divisionFees } = useQuery({
    queryKey: ["champ-division-fees", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("tournaments").select("division_fees").eq("id", champId!).maybeSingle();
      if (error) throw error;
      return ((data as any)?.division_fees ?? null) as Record<string, number> | null;
    },
    enabled: !!champId,
  });
  const { data: totalDueCents } = useQuery({
    queryKey: ["my-champ-reg-due", registration?.id, registration?.division_choices, registration?.partner_member_id, registration?.status],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("champ_member_total_due_cents", { p_champ_id: champId, p_member_id: memberId });
      if (error) throw error;
      return Number(data ?? 0);
    },
    enabled: !!champId && !!memberId && !!registration?.id,
  });
  const flat = Number(champ?.entry_fee_cents || 0);
  const labels = (champ?.group_labels || {}) as Record<string, string>;
  const groups = Array.isArray(registration?.division_choices)
    ? Array.from(new Set((registration.division_choices as any[]).map(Number))).filter(Number.isFinite)
    : [];
  const eventLabels = groups.map((g) => {
    const cents = divisionFees?.[String(g)] ?? flat;
    return `${labels[String(g)] || `Event ${g}`}${cents > 0 ? ` (${money(cents)})` : ""}`;
  });
  return { eventLabels, totalDueCents: totalDueCents ?? null, hasDivisionFees: !!divisionFees };
}
