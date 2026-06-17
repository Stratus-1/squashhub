import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Users, Trophy, UserCheck, UserMinus, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClubStatsCardProps {
  clubId?: string;
}

interface StatItem {
  label: string;
  value: number;
  icon: any;
  color: string;
}

export function ClubStatsCard({ clubId }: ClubStatsCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["club-stats", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      if (!clubId) return null;

      const since = new Date();
      since.setDate(since.getDate() - 60);
      const sinceIso = since.toISOString();
      const sinceDate = sinceIso.slice(0, 10);

      const [
        totalRes,
        leagueRes,
        visitorsRes,
        matchesRes,
        bookingsRes,
      ] = await Promise.all([
        supabase.from("club_members").select("*", { count: "exact", head: true }).eq("club_id", clubId),
        supabase.from("club_members").select("*", { count: "exact", head: true }).eq("club_id", clubId).eq("plays_league", true),
        supabase.from("club_visitors").select("*", { count: "exact", head: true }).eq("club_id", clubId),
        supabase.from("matches").select("player_a_member_id, player_b_member_id").eq("club_id", clubId).gte("match_date", sinceIso),
        supabase.from("bookings").select("member_id").eq("club_id", clubId).gte("date", sinceDate),
      ]);

      const activeIds = new Set<string>();
      (matchesRes.data || []).forEach((m: any) => {
        if (m.player_a_member_id) activeIds.add(m.player_a_member_id);
        if (m.player_b_member_id) activeIds.add(m.player_b_member_id);
      });
      (bookingsRes.data || []).forEach((b: any) => {
        if (b.member_id) activeIds.add(b.member_id);
      });

      const total = totalRes.count ?? 0;
      const active = activeIds.size;
      const inactive = Math.max(0, total - active);

      return {
        total,
        league: leagueRes.count ?? 0,
        visitors: visitorsRes.count ?? 0,
        active,
        inactive,
      };
    },
  });

  if (!clubId) return null;

  const stats: StatItem[] = [
    { label: "Members", value: data?.total ?? 0, icon: Users, color: "text-primary bg-primary/10" },
    { label: "Active (60d)", value: data?.active ?? 0, icon: UserCheck, color: "text-emerald-600 bg-emerald-500/10" },
    { label: "Inactive", value: data?.inactive ?? 0, icon: UserMinus, color: "text-slate-500 bg-slate-500/10" },
    { label: "League Players", value: data?.league ?? 0, icon: Trophy, color: "text-amber-600 bg-amber-500/10" },
    { label: "Visitors", value: data?.visitors ?? 0, icon: UserPlus, color: "text-cyan-600 bg-cyan-500/10" },
  ];

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Club at a glance</h3>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-1 rounded-md border border-border/60 bg-card p-2">
            <div className={cn("w-7 h-7 rounded-md flex items-center justify-center", s.color)}>
              <s.icon className="w-4 h-4" />
            </div>
            <div className="text-base font-bold leading-none tabular-nums">
              {isLoading ? "—" : s.value}
            </div>
            <div className="text-[10px] text-muted-foreground leading-tight text-center">{s.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
