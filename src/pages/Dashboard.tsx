import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SEO } from "@/components/SEO";
import { Calendar, Trophy, Swords, ChevronRight, Megaphone, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMyScheduledMatches, useProfile, useBookings, useMyBookings } from "@/hooks/use-data";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: todayBookings } = useBookings(todayStr);
  const { data: myBookings } = useMyBookings();
  const { data: myScheduledMatches } = useMyScheduledMatches();

  const firstName = profile?.name?.split(" ")[0] || "Player";

  const trackableBooking = useMemo(() => {
    const list = (myBookings || []).filter((b) => b.status === "active");
    const now = new Date();

    const candidates = list
      .filter((b) => b.date === todayStr)
      .map((b) => {
        const start = new Date(`${b.date}T${b.start_time}`);
        const end = new Date(`${b.date}T${b.end_time}`);
        return { booking: b, start, end };
      })
      .filter(({ start, end }) => Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()))
      .map(({ booking, start, end }) => {
        const msToStart = start.getTime() - now.getTime();
        const isStartingSoon = msToStart <= 15 * 60 * 1000 && msToStart >= -5 * 60 * 1000;
        const isOngoing = now >= start && now <= end;
        return { booking, start, end, isStartingSoon, isOngoing, msToStart };
      })
      .filter((x) => x.isOngoing || x.isStartingSoon)
      .sort((a, b) => Math.abs(a.msToStart) - Math.abs(b.msToStart));

    return candidates[0] ?? null;
  }, [myBookings, todayStr]);

  const scheduledOpponentIds = useMemo(() => {
    if (!user?.id) return [] as string[];
    const ids = (myScheduledMatches || [])
      .map((s: any) => (s.player_a === user.id ? s.player_b : s.player_a))
      .filter(Boolean) as string[];
    return [...new Set(ids)];
  }, [myScheduledMatches, user?.id]);

  const { data: opponentProfiles } = useQuery({
    queryKey: ["scheduled-opponents", user?.id, scheduledOpponentIds.join(",")],
    queryFn: async () => {
      if (scheduledOpponentIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id,name")
        .in("id", scheduledOpponentIds);
      if (error) throw error;
      return data || [];
    },
    enabled: scheduledOpponentIds.length > 0,
  });

  const opponentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of opponentProfiles || []) map.set(p.id, (p as any).name || "Unknown");
    return map;
  }, [opponentProfiles]);

  const { data: availablePlayers } = useQuery({
    queryKey: ["dashboard-available-players"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id,name,rank,availability")
        .not("availability", "is", null)
        .neq("availability", "")
        .order("rank", { ascending: true })
        .limit(8);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Gordon's Bay Squash" subtitle={`Welcome back, ${firstName}`} showNotifications />

      {/* Quick Stats */}
      <motion.div
        className="grid grid-cols-4 gap-2 px-4 mt-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <StatCard label="Rank" value={profile?.rank ? `#${profile.rank}` : "—"} />
        <StatCard label="Played" value={profile?.matches_played || 0} />
        <StatCard label="Wins" value={profile?.wins || 0} variant="win" />
        <StatCard label="Losses" value={profile?.losses || 0} variant="loss" />
      </motion.div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-2 px-4 mt-4">
        <Button variant="outline" className="flex flex-col items-center gap-1 h-auto py-3 bg-card" onClick={() => navigate("/bookings")}>
          <Calendar className="w-5 h-5 text-primary" />
          <span className="text-[11px]">Book Court</span>
        </Button>
        <Button variant="outline" className="flex flex-col items-center gap-1 h-auto py-3 bg-card" onClick={() => navigate("/ladder")}>
          <Trophy className="w-5 h-5 text-primary" />
          <span className="text-[11px]">Ladder</span>
        </Button>
        <Button variant="outline" className="flex flex-col items-center gap-1 h-auto py-3 bg-card" onClick={() => navigate("/challenges/new")}>
          <Swords className="w-5 h-5 text-primary" />
          <span className="text-[11px]">Challenge</span>
        </Button>
      </div>

      {/* Availability */}
      {availablePlayers && availablePlayers.length > 0 && (
        <motion.div
          className="px-4 mt-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold font-heading">Who's available</h2>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/ladder")}>
              View ladder <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
          <div className="space-y-2">
            {(availablePlayers || []).slice(0, 6).map((p: any) => (
              <Card
                key={p.id}
                className="p-3 cursor-pointer hover:bg-secondary/40 transition-colors"
                onClick={() => navigate(`/players/${p.id}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {p.name}{" "}
                      {typeof p.rank === "number" ? (
                        <span className="text-xs text-muted-foreground">(Rank #{p.rank})</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">(Unranked)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {p.availability}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {trackableBooking && (
        <motion.div
          className="px-4 mt-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold font-heading">
                {trackableBooking.isOngoing ? "Match in progress" : "Match starting soon"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Track your match with a start/stop timer, then attach the Strava activity after.
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => navigate(`/match-tracker/${trackableBooking.booking.id}`)}
            >
              Track
            </Button>
          </Card>
        </motion.div>
      )}

      {myScheduledMatches && myScheduledMatches.length > 0 && (
        <motion.div
          className="px-4 mt-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold font-heading">My Scheduled Matches</h2>
          </div>
          <div className="space-y-2">
            {myScheduledMatches.slice(0, 3).map((s: any) => {
              const opponentId = user?.id ? (s.player_a === user.id ? s.player_b : s.player_a) : null;
              const opponentName = opponentId ? opponentNameMap.get(opponentId) || "Opponent" : "Opponent";
              const courtLabel = s.court_id ? `Court ${s.court_id}` : "Court";
              return (
                <Card key={s.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">Vs {opponentName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {s.scheduled_date} · {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)} · {courtLabel}
                    </p>
                  </div>
                  {s.booking_id ? (
                    <Button size="sm" variant="outline" className="shrink-0 h-8 text-xs" onClick={() => navigate(`/match-tracker/${s.booking_id}`)}>
                      Track
                    </Button>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Today's Bookings */}
      <motion.div
        className="px-4 mt-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold font-heading">Today's Bookings</h2>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/bookings")}>
            View all <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
        {todayBookings && todayBookings.length > 0 ? (
          <div className="space-y-2">
            {todayBookings.slice(0, 3).map((booking) => (
              <Card key={booking.id} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">{booking.court_id}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {booking.player_name || "Unknown"}
                      {(booking as any).opponent_name ? ` vs ${(booking as any).opponent_name}` : ""}
                      {(booking as any).is_friendly ? " (Friendly)" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Court {booking.court_id}
                      {(booking as any).player_availability ? ` · ${(booking as any).player_availability}` : ""}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {booking.start_time?.slice(0, 5)} - {booking.end_time?.slice(0, 5)}
                </Badge>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-4 text-center text-sm text-muted-foreground">
            No bookings today. Book a court to get started!
          </Card>
        )}
      </motion.div>

      {/* My Upcoming Bookings */}
      {myBookings && myBookings.length > 0 && (
        <motion.div
          className="px-4 mt-5 mb-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-sm font-semibold font-heading mb-2">My Upcoming</h2>
          <div className="space-y-2">
            {myBookings.slice(0, 3).map((booking) => (
              <Card key={booking.id} className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{booking.court_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {booking.date}
                    {(booking as any).opponent_name ? ` · vs ${(booking as any).opponent_name}` : ""}
                    {(booking as any).is_friendly ? " · Friendly" : ""}
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {booking.start_time?.slice(0, 5)}
                </Badge>
              </Card>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
