import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useClubAnalytics } from "@/hooks/use-analytics";

interface Props {
  played: number;
  wins: number;
  losses: number;
  winRate: number; // 0..100
  rank: number | null;
  totalBookings: number;
  courtsUsed: number;
}

type Scope = "me" | "club";

export function DashboardMyStatsCard(props: Props) {
  const [scope, setScope] = useState<Scope>("me");
  const { data: clubStats } = useClubAnalytics(30);

  const winRate = Math.max(0, Math.min(100, Math.round(props.winRate)));
  const clubConfirmRate =
    clubStats && clubStats.total_matches > 0
      ? Math.round((clubStats.confirmed_matches / clubStats.total_matches) * 100)
      : 0;
  const displayedRate = scope === "club" ? clubConfirmRate : winRate;

  const ringStyle = useMemo(
    () => ({
      background: `conic-gradient(hsl(var(--primary)) ${displayedRate * 3.6}deg, hsl(var(--muted-foreground) / 0.25) 0deg)`,
    }),
    [displayedRate]
  );

  const StatTile = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="rounded-lg bg-muted/40 border border-border p-2.5 flex flex-col justify-between min-h-[72px]">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-xl font-heading font-bold text-foreground tabular-nums">{value}</span>
    </div>
  );

  return (
    <Card className="p-3 rounded-2xl">
      <div className="grid grid-cols-2 rounded-xl overflow-hidden border border-border mb-3">
        <button
          onClick={() => setScope("me")}
          className={cn(
            "py-2 text-xs font-heading uppercase tracking-[0.18em] transition-colors",
            scope === "me"
              ? "bg-primary text-primary-foreground"
              : "bg-transparent text-foreground/70 hover:bg-muted/50"
          )}
        >
          My Stats
        </button>
        <button
          onClick={() => setScope("club")}
          className={cn(
            "py-2 text-xs font-heading uppercase tracking-[0.18em] transition-colors",
            scope === "club"
              ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
              : "bg-transparent text-foreground/80"
          )}
        >
          Club
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-muted/40 border border-border p-2.5 flex flex-col justify-between row-span-2 min-h-[152px]">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {scope === "club" ? "Confirmed rate" : "Win rate"}
          </span>
          <div className="flex-1 flex items-center justify-center">
            <div className="w-20 h-20 rounded-full grid place-items-center" style={ringStyle}>
              <div className="w-[64px] h-[64px] rounded-full bg-card grid place-items-center">
                <span className="text-lg font-heading font-bold text-foreground">{displayedRate}%</span>
              </div>
            </div>
          </div>
        </div>

        {scope === "me" ? (
          <>
            <StatTile label="Played" value={props.played} />
            <StatTile label="Wins" value={props.wins} />
            <StatTile label="Losses" value={props.losses} />
            <StatTile label="Rank" value={props.rank != null ? `#${props.rank}` : "—"} />
          </>
        ) : (
          <>
            <StatTile label="Matches" value={clubStats?.total_matches ?? 0} />
            <StatTile label="Players" value={clubStats?.active_players ?? 0} />
            <StatTile
              label="Avg Dur"
              value={clubStats?.avg_duration_min != null ? `${Math.round(clubStats.avg_duration_min)}m` : "—"}
            />
            <StatTile label="Confirmed" value={clubStats?.confirmed_matches ?? 0} />
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {scope === "club" ? "Bookings (30d)" : "Total Bookings"}
          </span>
          <span className="text-lg font-heading font-bold text-foreground tabular-nums">
            {scope === "club" ? clubStats?.total_bookings ?? 0 : props.totalBookings}
          </span>
        </div>
        <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {scope === "club" ? "Top Players" : "Courts Used"}
          </span>
          <span className="text-lg font-heading font-bold text-foreground tabular-nums">
            {scope === "club" ? (clubStats?.top_players?.length ?? 0) : props.courtsUsed}
          </span>
        </div>
      </div>
    </Card>
  );
}
