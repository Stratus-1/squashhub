/**
 * "How many players entered?" — shown on the admin tournament card and in the
 * tournament setup dialog so both read the same registration rows.
 */
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { fromExt } from "@/lib/supabase-ext";
import { countEntries } from "@/lib/tournaments/entry-counts";
import { cn } from "@/lib/utils";

interface Props {
  champId: string;
  className?: string;
}

export function TournamentEntryCounts({ champId, className }: Props) {
  const { data } = useQuery({
    queryKey: ["champ-entry-counts", champId],
    enabled: !!champId,
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_registrations")
        .select("club_member_id, partner_member_id, status, division_choices, confirmed_at, paid_at, fee_paid_cents")
        .eq("champ_id", champId);
      if (error) throw error;
      return countEntries((data || []) as any[]);
    },
  });

  if (!data) return null;

  return (
    <p className={cn("text-xs text-muted-foreground flex items-center gap-1", className)}>
      <Users className="w-3 h-3" />
      <span>
        <strong className="text-foreground">{data.uniquePlayers}</strong> unique player
        {data.uniquePlayers === 1 ? "" : "s"} ·{" "}
        <strong className="text-foreground">{data.totalEntries}</strong>{" "}
        {data.totalEntries === 1 ? "entry" : "entries"} in total
      </span>
    </p>
  );
}
