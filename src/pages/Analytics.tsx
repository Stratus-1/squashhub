import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, BarChart3, Users, Clock, Trophy, Flame, TrendingUp, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { useClubAnalytics, usePersonalAnalytics, useMatchOfTheWeek } from "@/hooks/use-analytics";
import { useLadder, useProfile } from "@/hooks/use-data";
import { useAuth } from "@/contexts/AuthContext";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";
import { AppleStatsCard } from "@/components/AppleStatsCard";

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

function MatchOfTheWeekCard() {
  const { data: motw, isLoading } = useMatchOfTheWeek();

  if (isLoading || !motw) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-accent/30 bg-accent/5 overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-accent-foreground" />
            <span className="text-xs font-bold font-heading uppercase tracking-wider">Match of the Week</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <p className="text-sm font-bold font-heading">{motw.player_a_name || "Player A"}</p>
              <p className="text-[10px] text-muted-foreground">
                {motw.winner_id === motw.player_a ? "🏆 Winner" : ""}
              </p>
            </div>
            <div className="px-3">
              <Badge className="bg-primary/15 text-primary border-0 text-sm font-bold">
                {motw.score || "vs"}
              </Badge>
            </div>
            <div className="text-center flex-1">
              <p className="text-sm font-bold font-heading">{motw.player_b_name || "Player B"}</p>
              <p className="text-[10px] text-muted-foreground">
                {motw.winner_id === motw.player_b ? "🏆 Winner" : ""}
              </p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">{motw.match_date}</p>
        </CardContent>
      </Card>
    </motion.div>
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

function PersonalStatsSnapshot() {
  const { data: profile } = useProfile();
  const matchesPlayed = profile?.matches_played ?? 0;
  const wins = profile?.wins ?? 0;
  const losses = profile?.losses ?? 0;
  const winRate = matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <AppleStatsCard
        title="Your stats"
        subtitle="Snapshot of your performance."
        badgeText={profile?.rank ? `Rank #${profile.rank}` : "Unranked"}
        ringLabel="Win rate"
        ringValue={`${winRate}%`}
        progress={{
          played: Math.min(1, matchesPlayed / 50),
          wins: Math.min(1, wins / 25),
          winPct: Math.min(1, winRate / 100),
        }}
        tiles={[
          { label: "Played", value: matchesPlayed, unit: "matches", dotColor: "#007aff" },
          { label: "Wins", value: wins, unit: "wins", dotColor: "#34c759" },
          { label: "Losses", value: losses, unit: "losses", dotColor: "#ff9500" },
          { label: "Rank", value: profile?.rank ? `#${profile.rank}` : "—", unit: "ladder", dotColor: "#ff2d55" },
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
