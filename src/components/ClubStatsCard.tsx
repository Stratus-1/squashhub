import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Users, Trophy, UserCheck, UserMinus, UserPlus, UserX } from "lucide-react";
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

      // Exclude synthetic role='visitor' shadow member rows (created by the
      // tournament wizard to satisfy FKs) from the real member headcounts.
      // Visitors are counted from `club_visitors` only — every shadow member
      // is created from a `club_visitors` row, so counting both double-counts.
      const [totalRes, activeRes, suspendedRes, resignedRes, leagueRes, visitorsRes] = await Promise.all([
        supabase.from("club_members").select("*", { count: "exact", head: true }).eq("club_id", clubId).neq("role", "visitor"),
        supabase.from("club_members").select("*", { count: "exact", head: true }).eq("club_id", clubId).eq("status", "active").neq("role", "visitor"),
        supabase.from("club_members").select("*", { count: "exact", head: true }).eq("club_id", clubId).eq("status", "suspended").neq("role", "visitor"),
        supabase.from("club_members").select("*", { count: "exact", head: true }).eq("club_id", clubId).eq("status", "resigned").neq("role", "visitor"),
        supabase.from("club_members").select("*", { count: "exact", head: true }).eq("club_id", clubId).eq("plays_league", true).neq("role", "visitor"),
        supabase.from("club_visitors").select("*", { count: "exact", head: true }).eq("club_id", clubId),
      ]);

      return {
        total: totalRes.count ?? 0,
        active: activeRes.count ?? 0,
        suspended: suspendedRes.count ?? 0,
        resigned: resignedRes.count ?? 0,
        league: leagueRes.count ?? 0,
        visitors: visitorsRes.count ?? 0,
      };
    },
  });

  if (!clubId) return null;

  const stats: StatItem[] = [
    { label: "Members", value: data?.total ?? 0, icon: Users, color: "text-primary bg-primary/10" },
    { label: "Active", value: data?.active ?? 0, icon: UserCheck, color: "text-emerald-600 bg-emerald-500/10" },
    { label: "Suspended", value: data?.suspended ?? 0, icon: UserMinus, color: "text-amber-600 bg-amber-500/10" },
    { label: "Resigned", value: data?.resigned ?? 0, icon: UserX, color: "text-slate-500 bg-slate-500/10" },
    { label: "League Players", value: data?.league ?? 0, icon: Trophy, color: "text-amber-600 bg-amber-500/10" },
    { label: "Visitors", value: data?.visitors ?? 0, icon: UserPlus, color: "text-cyan-600 bg-cyan-500/10" },
  ];

  return (
    <Card className="p-3 bg-white border-slate-200 text-slate-900 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Club at a glance</h3>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-1 rounded-md border border-slate-200 bg-white p-2">
            <div className={cn("w-7 h-7 rounded-md flex items-center justify-center", s.color)}>
              <s.icon className="w-4 h-4" />
            </div>
            <div className="text-base font-bold leading-none tabular-nums text-slate-900">
              {isLoading ? "—" : s.value}
            </div>
            <div className="text-[10px] text-slate-500 leading-tight text-center">{s.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
