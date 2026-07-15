import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, BarChart3, Users, Clock, Trophy, TrendingUp, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useClubAnalytics, usePersonalAnalytics } from "@/hooks/use-analytics";
import { useLadder, useProfile, useSquashTotals } from "@/hooks/use-data";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useClubContext } from "@/contexts/ClubContext";
import { fromExt } from "@/lib/supabase-ext";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";
import { AppleStatsCard } from "@/components/AppleStatsCard";
import { MatchOfTheWeekCard } from "@/components/MatchOfTheWeekCard";

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function StatBox({ icon: Icon, label, value, className }: { icon: any; label: string; value: string | number; className?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold font-heading leading-none">{value}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ClubTab() {
  const { data: analytics, isLoading } = useClubAnalytics(30);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!analytics) return <p className="text-sm text-muted-foreground text-center py-8">No data available.</p>;

  const hourData = (analytics.busiest_hours || []).map((h) => ({
    name: `${h.hour}:00`,
    bookings: h.count,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <StatBox icon={Calendar} label="Bookings" value={analytics.total_bookings} />
        <StatBox icon={Users} label="Active Players" value={analytics.active_players} />
        <StatBox icon={Clock} label="Avg Duration" value={analytics.avg_duration_min ? `${analytics.avg_duration_min}m` : "—"} />
        <StatBox icon={Trophy} label="Matches" value={analytics.confirmed_matches} />
      </div>

      {hourData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold font-heading mb-3">Busiest Hours</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={hourData}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="bookings" fill="hsl(152, 60%, 28%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {analytics.top_players && analytics.top_players.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold font-heading mb-3">Most Active Players</p>
            <div className="space-y-2">
              {analytics.top_players.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                    {i + 1}
                  </div>
                  <span className="text-sm flex-1 truncate">{p.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{p.sessions} sessions</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PersonalTab() {
  const { data: analytics, isLoading } = usePersonalAnalytics(90);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!analytics) return <p className="text-sm text-muted-foreground text-center py-8">No data yet. Book some courts!</p>;

  const weeklyData = (analytics.weekly_performance || []).map((w) => ({
    week: w.week?.slice(5, 10) || "",
    matches: w.matches,
    wins: w.wins,
    winRate: w.matches > 0 ? Math.round((w.wins / w.matches) * 100) : 0,
  }));

  const peakHourData = (analytics.peak_hours || []).map((h) => ({
    name: `${h.hour}:00`,
    sessions: h.count,
  }));

  const favDays = (analytics.favourite_days || []).map((d) => ({
    day: DOW_NAMES[d.dow] || "?",
    count: d.count,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <StatBox icon={Calendar} label="Total Bookings" value={analytics.total_bookings} />
        <StatBox icon={BarChart3} label="Courts Used" value={analytics.total_courts_used} />
      </div>

      {weeklyData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold font-heading mb-3">Win Rate Trend</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(120, 10%, 88%)" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="winRate" stroke="hsl(152, 60%, 28%)" strokeWidth={2} dot={{ r: 3 }} name="Win %" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {peakHourData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold font-heading mb-3">Your Peak Hours</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={peakHourData}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="sessions" fill="hsl(72, 95%, 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {favDays.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold font-heading mb-3">Favourite Days</p>
            <div className="flex gap-2">
              {favDays.map((d) => (
                <div key={d.day} className="flex-1 text-center rounded-lg bg-primary/5 border border-primary/10 p-2">
                  <p className="text-sm font-bold font-heading">{d.count}</p>
                  <p className="text-[10px] text-muted-foreground">{d.day}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type Scope = "league" | "tournament" | "total";

function PersonalStatsSnapshot() {
  const { user } = useAuth();
  const { activeMember } = useMemberContext();
  const memberId = activeMember?.id || null;
  const { data: ladder } = useLadder();
  const [scope, setScope] = useState<Scope>("total");

  const myEntry = useMemo(() => {
    if (!ladder) return null as any;
    if (memberId) {
      const e = ladder.find((p: any) => p.club_member_id === memberId);
      if (e) return e;
    }
    if (user?.id) {
      return ladder.find((p: any) => p.user_id === user.id || p.id === user.id) || null;
    }
    return null;
  }, [ladder, memberId, user?.id]);

  const myLadderPosition =
    (myEntry as any)?.ladder_position ?? (myEntry as any)?.league_rank ?? (myEntry as any)?.rank ?? null;
  const leagueWins = (myEntry as any)?.wins ?? 0;
  const leagueLosses = (myEntry as any)?.losses ?? 0;
  const leaguePlayed = (myEntry as any)?.matches_played ?? (leagueWins + leagueLosses);

  // Tournament stats — same logic as Dashboard.
  const { data: tournamentStats } = useQuery({
    queryKey: ["my-tournament-stats-analytics", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      if (!memberId) return { wins: 0, losses: 0, played: 0 };
      const { data, error } = await fromExt("club_champs_matches")
        .select(
          "status, is_bye, winner_member_id, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id",
        )
        .eq("status", "completed")
        .or(
          `player_a_member_id.eq.${memberId},player_b_member_id.eq.${memberId},partner_a_member_id.eq.${memberId},partner_b_member_id.eq.${memberId}`,
        );
      if (error) throw error;
      let wins = 0,
        losses = 0;
      for (const m of (data || []) as any[]) {
        if (m.is_bye) continue;
        const onSideA = m.player_a_member_id === memberId || m.partner_a_member_id === memberId;
        const onSideB = m.player_b_member_id === memberId || m.partner_b_member_id === memberId;
        if (!onSideA && !onSideB) continue;
        const winner = m.winner_member_id;
        if (!winner) continue;
        const winnerOnSideA = winner === m.player_a_member_id || winner === m.partner_a_member_id;
        const iWon = (onSideA && winnerOnSideA) || (onSideB && !winnerOnSideA);
        if (iWon) wins++;
        else losses++;
      }
      return { wins, losses, played: wins + losses };
    },
  });

  const tWins = tournamentStats?.wins ?? 0;
  const tLosses = tournamentStats?.losses ?? 0;
  const tPlayed = tournamentStats?.played ?? 0;

  const view = useMemo(() => {
    if (scope === "league") return { wins: leagueWins, losses: leagueLosses, played: leaguePlayed };
    if (scope === "tournament") return { wins: tWins, losses: tLosses, played: tPlayed };
    return { wins: leagueWins + tWins, losses: leagueLosses + tLosses, played: leaguePlayed + tPlayed };
  }, [scope, leagueWins, leagueLosses, leaguePlayed, tWins, tLosses, tPlayed]);

  const winRate = view.played > 0 ? Math.round((view.wins / view.played) * 100) : 0;
  const subtitle =
    scope === "league"
      ? "League matches only."
      : scope === "tournament"
      ? "Club tournament matches only."
      : "League + tournament combined (matches Dashboard).";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
      <div className="grid grid-cols-3 rounded-xl overflow-hidden border border-border">
        {(["league", "tournament", "total"] as Scope[]).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={cn(
              "py-2 text-[11px] font-heading uppercase tracking-[0.16em] transition-colors",
              scope === s
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-foreground/70 hover:bg-muted/50",
            )}
          >
            {s === "league" ? "League" : s === "tournament" ? "Tournaments" : "Total"}
          </button>
        ))}
      </div>

      <AppleStatsCard
        title="Your stats"
        subtitle={subtitle}
        badgeText={myLadderPosition ? `Rank #${myLadderPosition}` : "Unranked"}
        ringLabel="Win rate"
        ringValue={`${winRate}%`}
        progress={{
          played: Math.min(1, view.played / 50),
          wins: Math.min(1, view.wins / 25),
          winPct: Math.min(1, winRate / 100),
        }}
        tiles={[
          { label: "Played", value: view.played, unit: "matches", dotColor: "#007aff" },
          { label: "Wins", value: view.wins, unit: "wins", dotColor: "#34c759" },
          { label: "Losses", value: view.losses, unit: "losses", dotColor: "#ff9500" },
          {
            label: "Rank",
            value: myLadderPosition ? `#${myLadderPosition}` : "—",
            unit: "ladder",
            dotColor: "#ff2d55",
          },
        ]}
      />
    </motion.div>
  );
}

export default function Analytics() {
  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Analytics" subtitle="Club & personal insights" />

      <div className="px-4 mt-3 mb-3">
        <PersonalStatsSnapshot />
      </div>

      <div className="px-4 mb-3">
        <MatchOfTheWeekCard />
      </div>

      <div className="px-4">
        <Tabs defaultValue="personal" className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="personal" className="text-xs gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> My Stats
            </TabsTrigger>
            <TabsTrigger value="club" className="text-xs gap-1">
              <Users className="w-3.5 h-3.5" /> Club
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="mt-3">
            <PersonalTab />
          </TabsContent>
          <TabsContent value="club" className="mt-3">
            <ClubTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
