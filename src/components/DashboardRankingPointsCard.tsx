import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRankingMovement, rankDelta } from "@/hooks/use-ranking-movement";

interface Props {
  clubId: string | null;
  memberId: string | null;
}

/**
 * Shows the member's club ranking points, their position on the club points
 * leaderboard, and movement since the last monthly snapshot.
 * Renders nothing when the club has ranking points disabled or the member
 * has no points record.
 */
export function DashboardRankingPointsCard({ clubId, memberId }: Props) {
  const { data } = useQuery({
    queryKey: ["my-club-ranking-points", clubId, memberId],
    enabled: !!clubId && !!memberId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: club } = await (supabase as any)
        .from("clubs")
        .select("ranking_points_enabled")
        .eq("id", clubId!)
        .maybeSingle();
      if (!club?.ranking_points_enabled) return null;

      const { data: me } = await (supabase as any)
        .from("club_members")
        .select("id, ranking_points")
        .eq("id", memberId!)
        .maybeSingle();
      if (!me) return null;

      const myPoints = Number(me.ranking_points ?? 0);

      // Leaderboard position: rankable members (on the ladder, not visitors)
      // with more points than me.
      const { count } = await (supabase as any)
        .from("club_members")
        .select("id", { count: "exact", head: true })
        .eq("club_id", clubId!)
        .not("ladder_position", "is", null)
        .neq("role", "visitor")
        .gt("ranking_points", myPoints);

      return { points: myPoints, rank: (count ?? 0) + 1 };
    },
  });

  const movement = useRankingMovement(clubId, !!data);
  const prev = memberId ? movement.data?.byMember.get(memberId) : undefined;
  const delta = data ? rankDelta(data.rank, prev?.previousRank) : null;

  if (!data) return null;

  return (
    <Card className="p-3 rounded-2xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 grid place-items-center shrink-0">
            <Trophy className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Club Ranking Points</p>
            <p className="text-lg font-heading font-bold text-foreground tabular-nums leading-tight">
              {data.points.toFixed(2)} pts
              <span className="text-sm font-medium text-muted-foreground"> · #{data.rank}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {delta != null && (
            <span
              className={
                delta > 0
                  ? "flex items-center gap-1 text-xs font-semibold text-win"
                  : delta < 0
                    ? "flex items-center gap-1 text-xs font-semibold text-loss"
                    : "flex items-center gap-1 text-xs font-semibold text-muted-foreground"
              }
              title="Movement since last monthly snapshot"
            >
              {delta > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : delta < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
          <Link to="/ladder" className="text-xs font-medium text-primary hover:underline">
            View
          </Link>
        </div>
      </div>
    </Card>
  );
}
