import { PageHeader } from "@/components/PageHeader";

import { IncomingChallengesCard } from "@/components/IncomingChallengesCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SEO } from "@/components/SEO";

import { OnboardingWizard } from "@/components/OnboardingWizard";
import { DashboardTutorial } from "@/components/DashboardTutorial";
import { WelcomeBanner } from "@/components/WelcomeBanner";
import { AvatarFeatureBanner } from "@/components/AvatarFeatureBanner";
import { ProfileCompletionMeter } from "@/components/ProfileCompletionMeter";
import { MatchOfTheWeekCard } from "@/components/MatchOfTheWeekCard";
import { Calendar, Trophy, Swords, ChevronRight, Loader2, LifeBuoy, Settings, Shield, ShieldCheck, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useChallenges, useMyScheduledMatches, useProfile, useBookings, useMyBookings } from "@/hooks/use-data";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardAccountSettings } from "@/components/DashboardAccountSettings";

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const { data: clubData } = useMyClub();
  const ladderStatus = (clubData?.club as any)?.ladder_status || "unranked";
  const ladderActive = ladderStatus === "active";
  const isClubAdmin = useIsClubAdmin();
  const { data: challenges } = useChallenges();
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: todayBookings } = useBookings(todayStr);
  const { data: myBookings } = useMyBookings();
  const { data: myScheduledMatches } = useMyScheduledMatches();

  const firstName = profile?.name?.split(" ")[0] || "Player";
  const openProfile = (to: string = "/profile") => navigate(to, { state: { backgroundLocation: location } });
  const matchesPlayed = profile?.matches_played ?? 0;
  const wins = profile?.wins ?? 0;
  const losses = profile?.losses ?? 0;
  const winRate = matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0;

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

  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);

  useEffect(() => {
    if (!isLoading && profile) {
      const needsOnboarding =
        !profile.name || profile.name === "" || profile.name === "New Player";
      const alreadyCompleted = (profile as any).onboarding_completed === true;
      if (needsOnboarding && !alreadyCompleted && !onboardingDone) {
        setShowOnboarding(true);
      }
    }
  }, [isLoading, profile, onboardingDone]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="bottom-nav-safe relative">
      <SEO title="Home" description="Your squash hub — stats, bookings, and challenges." path="/" noIndex />

      <OnboardingWizard
        open={showOnboarding}
        onComplete={() => {
          setShowOnboarding(false);
          setOnboardingDone(true);
        }}
      />
      <DashboardTutorial />

      <PageHeader title={clubData?.club?.name || "SquashHub"} subtitle={`Welcome back, ${firstName}`} showNotifications showProfile />

      <WelcomeBanner />

      {/* Profile Completion — only show if incomplete */}
      <div className="px-4 mt-2">
        <ProfileCompletionMeter
          profile={profile}
          onAction={(action) => {
            if (action === "edit") openProfile("/profile?edit=1");
            if (action === "avatar") openProfile("/profile?edit=1&focus=avatar");
            if (action === "availability") navigate("/availability");
          }}
        />
      </div>

      <AvatarFeatureBanner />

      {/* Primary Actions — Book, Ladder, Profile */}
      <div className="px-4 mt-4">
        <div className="grid grid-cols-4 gap-2">
          <Button className="flex-col h-auto py-3 gap-1.5" onClick={() => navigate("/bookings")}>
            <Calendar className="w-5 h-5" />
            <span className="text-xs font-medium">Book Court</span>
          </Button>
          <Button variant="outline" className="flex-col h-auto py-3 gap-1.5" onClick={() => navigate("/ladder")}>
            <Trophy className="w-5 h-5" />
            <span className="text-xs font-medium">Ladder</span>
          </Button>
          <Button variant="outline" className="flex-col h-auto py-3 gap-1.5 border-primary/30 bg-primary/5" onClick={() => navigate("/my-account")}>
            <Wallet className="w-5 h-5" />
            <span className="text-xs font-medium">My Account</span>
          </Button>
          <Button variant="outline" className="flex-col h-auto py-3 gap-1.5" onClick={() => openProfile("/profile?edit=1")}>
            <Settings className="w-5 h-5" />
            <span className="text-xs font-medium">My Profile</span>
          </Button>
        </div>
      </div>

      {/* Ladder Status Banner */}
      <div className={cn(
        "mx-4 mt-2 p-2.5 rounded-lg border flex items-center gap-2",
        ladderStatus === "active" ? "bg-green-500/10 border-green-500/30" :
        ladderStatus === "provisional" ? "bg-amber-500/10 border-amber-500/30" :
        "bg-muted border-border"
      )}>
        {ladderStatus === "active"
          ? <ShieldCheck className="w-4 h-4 shrink-0 text-green-500" />
          : <Shield className={cn("w-4 h-4 shrink-0", ladderStatus === "provisional" ? "text-amber-500" : "text-muted-foreground")} />
        }
        <p className="text-xs text-muted-foreground">
          {ladderStatus === "active" && "Ladder is active — challenge players ranked above you!"}
          {ladderStatus === "provisional" && "Rankings are provisional. Challenges will open once the admin activates the ladder."}
          {ladderStatus === "unranked" && "Ladder has not been ranked yet. Check back soon!"}
        </p>
      </div>

      {/* My Upcoming Bookings */}
      <motion.div
        className="px-4 mt-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold font-heading">My Upcoming</h2>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/bookings")}>
            View all <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
        {myBookings && myBookings.length > 0 ? (
          <div className="space-y-1.5">
            {myBookings.slice(0, 3).map((booking) => (
              <Card key={booking.id} className="p-2.5 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {booking.court_name}
                    {booking.opponent_name ? ` — vs ${booking.opponent_name}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{booking.date} · {booking.start_time?.slice(0, 5)}</p>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {booking.start_time?.slice(0, 5)}
                </Badge>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-3 text-center text-sm text-muted-foreground">
            No upcoming bookings
          </Card>
        )}
      </motion.div>

      {/* Active match tracker */}
      {trackableBooking && (
        <motion.div
          className="px-4 mt-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="p-3 flex items-center justify-between gap-3 border-primary/30 bg-primary/5">
            <div className="min-w-0">
              <p className="text-sm font-semibold font-heading">
                {trackableBooking.isOngoing ? "Match in progress" : "Match starting soon"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Track your match live
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

      {/* Scheduled Matches */}
      {myScheduledMatches && myScheduledMatches.length > 0 && (
        <motion.div
          className="px-4 mt-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold font-heading">Scheduled Matches</h2>
          </div>
          <div className="space-y-1.5">
            {myScheduledMatches.slice(0, 3).map((s: any) => {
              const opponentId = user?.id ? (s.player_a === user.id ? s.player_b : s.player_a) : null;
              const opponentName = opponentId ? opponentNameMap.get(opponentId) || "Opponent" : "Opponent";
              return (
                <Card key={s.id} className="p-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">Vs {opponentName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {s.scheduled_date} · {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}
                    </p>
                  </div>
                  {s.booking_id && (
                    <Button size="sm" variant="outline" className="shrink-0 h-7 text-[11px]" onClick={() => navigate(`/match-tracker/${s.booking_id}`)}>
                      Track
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        </motion.div>
      )}

      <div className="px-4 mt-3">
        <IncomingChallengesCard
          userId={user?.id}
          challenges={challenges}
          onViewAll={() => navigate("/challenges?view=inbox")}
        />
      </div>

      {/* Stats */}
      <motion.div
        className="px-4 mt-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
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

      {/* Match of the Week */}
      <div className="px-4 mt-3">
        <MatchOfTheWeekCard />
      </div>

      {/* More Actions */}
      <div className="px-4 mt-5">
        <p className="text-sm font-semibold font-heading mb-2">More</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="justify-between h-11 px-3" onClick={() => navigate("/challenges/new")} disabled={!ladderActive}>
            <span className="inline-flex items-center gap-2">
              <Swords className="w-4 h-4" />
              Create Challenge
            </span>
            <ChevronRight className="w-4 h-4 opacity-70" />
          </Button>
          <Button variant="outline" className="justify-between h-11 px-3" onClick={() => navigate("/challenges?view=inbox")}>
            <span className="inline-flex items-center gap-2">
              <Swords className="w-4 h-4" />
              Challenges Inbox
            </span>
            <ChevronRight className="w-4 h-4 opacity-70" />
          </Button>
          <Button variant="outline" className="justify-between h-11 px-3" onClick={() => navigate("/support")}>
            <span className="inline-flex items-center gap-2">
              <LifeBuoy className="w-4 h-4" />
              Support
            </span>
            <ChevronRight className="w-4 h-4 opacity-70" />
          </Button>
          {isClubAdmin && (
            <Button variant="outline" className="justify-between h-11 px-3 border-primary/30 bg-primary/5" onClick={() => navigate("/club-admin")}>
              <span className="inline-flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Club Admin
              </span>
              <ChevronRight className="w-4 h-4 opacity-70" />
            </Button>
          )}
        </div>
      </div>

      {/* Today's Bookings */}
      <motion.div
        className="px-4 mt-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold font-heading">Today's Bookings</h2>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/bookings")}>
            View all <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
        {todayBookings && todayBookings.length > 0 ? (
          <div className="space-y-1.5">
            {todayBookings.slice(0, 3).map((booking) => (
              <Card key={booking.id} className="p-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">{booking.court_id}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {booking.player_name || "Unknown"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Court {booking.court_id}</p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {booking.start_time?.slice(0, 5)}
                </Badge>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-3 text-center text-sm text-muted-foreground">
            No bookings today
          </Card>
        )}
      </motion.div>

      <motion.div
        className="px-4 mt-4 mb-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <DashboardAccountSettings />
      </motion.div>
    </div>
  );
}
