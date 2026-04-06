import { PageHeader } from "@/components/PageHeader";

import { IncomingChallengesCard } from "@/components/IncomingChallengesCard";
import { CreateClubEvent } from "@/components/CreateClubEvent";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SEO } from "@/components/SEO";
import { Users } from "lucide-react";

import { MemberOnboardingWizard } from "@/components/MemberOnboardingWizard";
import { MyChampionships } from "@/components/MyChampionships";

import { WelcomeBanner } from "@/components/WelcomeBanner";
import { ProfileCompletionMeter } from "@/components/ProfileCompletionMeter";
import { FaceEnrolmentDialog } from "@/components/FaceEnrolmentDialog";
import { Calendar, CalendarDays, Trophy, Swords, ChevronRight, Loader2, LifeBuoy, Settings, ShieldCheck, Wallet, ClipboardCheck, Crosshair, History, Check, X, Wine } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useChallenges, useMyScheduledMatches, useProfile, useBookings, useMyBookings, useLadder } from "@/hooks/use-data";
import { useMyClub, useIsClubAdmin, useMyClubMember } from "@/hooks/use-club";
import { useClubContext } from "@/contexts/ClubContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { user } = useAuth();
  const { club: contextClub } = useClubContext();
  const { linkedMembers, activeMember, switchMember, effectiveUserId } = useMemberContext();
  const showFamilySwitcher = linkedMembers.length > 1;
  const { data: profile, isLoading } = useProfile();
  const { data: clubData, isLoading: isClubLoading } = useMyClub();
  const { data: myClubMember, isLoading: isClubMemberLoading } = useMyClubMember();
  const effectiveClub = clubData?.club || contextClub;
  const isClubAdmin = useIsClubAdmin();
  const myMemberId = activeMember?.id || null;
  const { data: challenges } = useChallenges(effectiveUserId, { memberId: myMemberId });
  const clubId = effectiveClub?.id || clubData?.club?.id;
  const { data: ladder } = useLadder(clubId);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: todayBookings } = useBookings(todayStr, clubId);
  const { data: myBookings } = useMyBookings(effectiveUserId, { memberId: myMemberId });
  const { data: myScheduledMatches } = useMyScheduledMatches(effectiveUserId);

  // Recent match results for the active member
  const { data: recentMatches } = useQuery({
    queryKey: ["club-recent-matches", myMemberId || effectiveUserId],
    queryFn: async () => {
      if (!myMemberId && !effectiveUserId) return [];
      const { data, error } = await supabase
        .from("matches")
        .select("id, player_a, player_b, winner_id, score, game_scores, match_date, confirmed, disputed, submitted_by, notes, player_a_member_id, player_b_member_id, winner_member_id")
        .or(myMemberId
          ? `player_a_member_id.eq.${myMemberId},player_b_member_id.eq.${myMemberId}`
          : `player_a.eq.${effectiveUserId},player_b.eq.${effectiveUserId}`)
        .order("match_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!(myMemberId || effectiveUserId),
  });

  // Get all player names for recent matches
  const matchPlayerIds = useMemo(() => {
    if (!recentMatches) return [] as string[];
    const ids = new Set<string>();
    for (const m of recentMatches) {
      if (m.player_a) ids.add(m.player_a);
      if (m.player_b) ids.add(m.player_b);
    }
    return [...ids];
  }, [recentMatches]);

  // Collect member IDs for name resolution (prioritise club_members over profiles)
  const matchMemberIds = useMemo(() => {
    if (!recentMatches) return [] as string[];
    const ids = new Set<string>();
    for (const m of recentMatches) {
      if ((m as any).player_a_member_id) ids.add((m as any).player_a_member_id);
      if ((m as any).player_b_member_id) ids.add((m as any).player_b_member_id);
    }
    return [...ids];
  }, [recentMatches]);

  const { data: matchMemberNames } = useQuery({
    queryKey: ["match-member-names", matchMemberIds.join(",")],
    queryFn: async () => {
      if (matchMemberIds.length === 0) return [];
      const { data } = await (supabase as any)
        .from("club_members")
        .select("id, name, user_id")
        .in("id", matchMemberIds);
      return data || [];
    },
    enabled: matchMemberIds.length > 0,
  });

  const { data: matchPlayerProfiles } = useQuery({
    queryKey: ["match-player-profiles", matchPlayerIds.join(",")],
    queryFn: async () => {
      if (matchPlayerIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", matchPlayerIds);
      return data || [];
    },
    enabled: matchPlayerIds.length > 0,
  });

  const matchPlayerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    // First load profile names (fallback)
    for (const p of matchPlayerProfiles || []) map.set(p.id, p.name || "Unknown");
    // Then overlay member names (priority) — map member's user_id to their member name
    for (const m of (matchMemberNames || []) as any[]) {
      if (m.user_id && m.name) map.set(m.user_id, m.name);
    }
    return map;
  }, [matchPlayerProfiles, matchMemberNames]);

  // Find player's position on gender-specific ladder
  const myLadderPosition = useMemo(() => {
    if (!ladder || !myClubMember || !user) return null;
    const effectiveMemberId = activeMember?.id || myClubMember.id;
    const gender = activeMember?.gender || (myClubMember as any)?.gender;
    const genderLadder = gender ? ladder.filter((p: any) => p.gender === gender) : ladder;
    const idx = genderLadder.findIndex((p: any) => p.club_member_id === effectiveMemberId || p.user_id === user.id);
    return idx >= 0 ? idx + 1 : null;
  }, [ladder, myClubMember, user, activeMember]);

  const firstName = (activeMember?.name || profile?.name)?.split(" ")[0] || "Player";
  const openProfile = (to: string = "/profile") => navigate(to, { state: { backgroundLocation: location } });

  const handleConfirmMatch = async (matchId: string) => {
    try {
      const { error } = await supabase.from("matches").update({ confirmed: true }).eq("id", matchId);
      if (error) throw error;
      toast.success("Match confirmed!");
      queryClient.invalidateQueries({ queryKey: ["club-recent-matches"] });
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    } catch {
      toast.error("Failed to confirm match");
    }
  };

  const handleDisputeMatch = async (matchId: string) => {
    try {
      const { error } = await supabase.from("matches").update({ disputed: true }).eq("id", matchId);
      if (error) throw error;
      toast.success("Match disputed. An admin will review.");
      queryClient.invalidateQueries({ queryKey: ["club-recent-matches"] });
    } catch {
      toast.error("Failed to dispute match");
    }
  };

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
    if (!effectiveUserId) return [] as string[];
    const ids = (myScheduledMatches || [])
      .map((s: any) => (s.player_a === effectiveUserId ? s.player_b : s.player_a))
      .filter(Boolean) as string[];
    return [...new Set(ids)];
  }, [myScheduledMatches, effectiveUserId]);

  const { data: opponentProfiles } = useQuery({
    queryKey: ["scheduled-opponents", effectiveUserId, scheduledOpponentIds.join(",")],
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
    if (isLoading || isClubLoading || isClubMemberLoading || !profile) return;

    // Club admins (captains/admins) skip the member onboarding wizard entirely
    // — they created the club and should go straight to admin.
    const isMemberAdmin =
      myClubMember?.role === "captain" || myClubMember?.role === "admin" ||
      clubData?.membership?.role === "captain" || clubData?.membership?.role === "admin";
    if (isMemberAdmin) return;

    const legacyNeedsOnboarding =
      !profile.name || profile.name === "" || profile.name === "New Player";

    const hasClub = !!effectiveClub;
    // Only show onboarding if the member hasn't been assigned a member number yet
    // (member number is assigned during the onboarding wizard completion)
    const missingMemberData =
      hasClub &&
      myClubMember &&
      !myClubMember.club_member_number;

    // If no club member record at all but club exists, they may need to register
    const noMemberRecord = hasClub && !myClubMember && !isClubMemberLoading;

    if ((legacyNeedsOnboarding || missingMemberData || noMemberRecord) && !onboardingDone) {
      setShowOnboarding(true);
    }
  }, [
    isLoading,
    isClubLoading,
    isClubMemberLoading,
    profile,
    effectiveClub,
    myClubMember,
    clubData,
    onboardingDone,
  ]);

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

      <MemberOnboardingWizard
        open={showOnboarding}
        onComplete={() => {
          setShowOnboarding(false);
          setOnboardingDone(true);
          // Force full reload so all queries (fees, member data, etc.) refresh cleanly
          setTimeout(() => window.location.reload(), 300);
        }}
      />
      

      <PageHeader title={effectiveClub?.name || "SquashHub"} subtitle={`Welcome back, ${firstName}`} showNotifications showProfile />

      <WelcomeBanner />

      {/* Family Member Switcher */}
      {showFamilySwitcher && (
        <div className="px-4 mt-2">
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold">Switch Member</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {linkedMembers.map(m => (
                <Button
                  key={m.id}
                  size="sm"
                  variant={activeMember?.id === m.id ? "default" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => switchMember(m.id)}
                >
                  {m.name || m.club_member_number || "Member"}
                </Button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Profile Completion — only show if incomplete */}
      <div className="px-4 mt-2">
        <ProfileCompletionMeter
          profile={profile}
          onAction={(action) => {
            if (action === "edit") openProfile("/profile?edit=1");
            if (action === "account") navigate("/my-account");
            if (action === "face") setShowFaceEnrolment(true);
          }}
        />
      </div>

      

      {/* Primary Actions — Book, Ladder, Profile */}
      <div className="px-4 mt-4">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <Button className="flex-col h-auto py-3 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0" onClick={() => navigate("/bookings")}>
            <Calendar className="w-5 h-5" />
            <span className="text-xs font-medium">Book</span>
          </Button>
          <Button variant="outline" className="flex-col h-auto py-3 gap-1.5 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20" onClick={() => navigate("/ladder")}>
            <Trophy className="w-5 h-5" />
            <span className="text-xs font-medium leading-tight text-center">Club Ladder</span>
          </Button>
          <Button variant="outline" className="flex-col h-auto py-3 gap-1.5 border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20" onClick={() => navigate("/add-result")}>
            <ClipboardCheck className="w-5 h-5" />
            <span className="text-xs font-medium leading-tight text-center">Enter Result</span>
          </Button>
          <Button variant="outline" className="flex-col h-auto py-3 gap-1.5 border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/20" onClick={() => navigate("/challenges")}>
            <Swords className="w-5 h-5" />
            <span className="text-xs font-medium leading-tight text-center">Challenges</span>
          </Button>
          <Button variant="outline" className="flex-col h-auto py-3 gap-1.5 border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400 hover:bg-violet-500/20" onClick={() => navigate("/match-marker")}>
            <Crosshair className="w-5 h-5" />
            <span className="text-xs font-medium leading-tight text-center">Mark a Game</span>
          </Button>
          <Button variant="outline" className="flex-col h-auto py-3 gap-1.5 border-pink-500/40 bg-pink-500/10 text-pink-700 dark:text-pink-400 hover:bg-pink-500/20" onClick={() => navigate("/events")}>
            <CalendarDays className="w-5 h-5" />
            <span className="text-xs font-medium leading-tight text-center">Events</span>
          </Button>
          <Button variant="outline" className="flex-col h-auto py-3 gap-1.5 border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-400 hover:bg-teal-500/20" onClick={() => navigate("/my-account")}>
            <Wallet className="w-5 h-5" />
            <span className="text-xs font-medium leading-tight text-center">My Account</span>
          </Button>
          <Button variant="outline" className="flex-col h-auto py-3 gap-1.5 border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-500/20" onClick={() => openProfile("/profile?edit=1")}>
            <Settings className="w-5 h-5" />
            <span className="text-xs font-medium leading-tight text-center">My Profile</span>
          </Button>
          {isClubAdmin && (
            <Button variant="outline" className="flex-col h-auto py-3 gap-1.5 border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400 hover:bg-orange-500/20" onClick={() => navigate("/club-admin")}>
              <ShieldCheck className="w-5 h-5" />
              <span className="text-xs font-medium leading-tight text-center">Club Admin</span>
            </Button>
          )}
        </div>
      </div>

      {/* Honesty Bar Quick Access */}
      {effectiveClub && (effectiveClub as any)?.honesty_bar_enabled && (
        <div className="px-4 mt-2">
          <Card
            className="p-3 flex items-center gap-3 cursor-pointer hover:bg-accent/50 transition-colors border-amber-500/30 bg-amber-500/5"
            onClick={() => navigate("/honesty-bar")}
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-500/15">
              <Wine className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Honesty Bar</p>
              <p className="text-xs text-muted-foreground">Log drinks & snacks to your tab</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </Card>
        </div>
      )}

      {myLadderPosition != null && (
        <div className="mx-4 mt-2 p-2.5 rounded-lg border bg-green-500/10 border-green-500/30 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-green-500" />
          <p className="text-xs text-muted-foreground flex-1">Challenge players ranked above you on the ladder!</p>
          <Badge variant="secondary" className="shrink-0 font-mono text-xs">
            #{myLadderPosition}
          </Badge>
        </div>
      )}

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

      {/* Match History */}
      <motion.div
        className="px-4 mt-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold font-heading flex items-center gap-1.5">
            <History className="w-4 h-4" /> Match Results
          </h2>
        </div>
        {recentMatches && recentMatches.length > 0 ? (
          <div className="space-y-1.5">
            {recentMatches.slice(0, 10).map((m: any) => {
              const isPlayerA = m.player_a === effectiveUserId;
              const isPlayerB = m.player_b === effectiveUserId;
              const isParticipant = isPlayerA || isPlayerB;
              const isSamePlayer = m.player_a === m.player_b;

              // When both player IDs are the same (external/unlinked players), parse names from notes
              let p1Name = matchPlayerNameMap.get(m.player_a) || "Player 1";
              let p2Name = matchPlayerNameMap.get(m.player_b) || "Player 2";

              if (isSamePlayer && m.notes) {
                const notesNames = m.notes.match(/Player\s*1[:\s]+([^.;\n]+)/i);
                const notesNames2 = m.notes.match(/Player\s*2[:\s]+([^.;\n]+)/i);
                if (notesNames) p1Name = notesNames[1].trim();
                if (notesNames2) p2Name = notesNames2[1].trim();
              }

              let label = "";
              if (isSamePlayer) {
                // Match recorded on behalf of others — show both names from notes
                const winnerNote = m.notes?.match(/Winner[:\s]+([^.;\n]+)/i);
                const winnerName = winnerNote ? winnerNote[1].trim() : null;
                label = `${p1Name} vs ${p2Name}`;
                if (winnerName) label += ` — ${winnerName} won`;
              } else if (isParticipant) {
                const opponentName = isPlayerA ? p2Name : p1Name;
                const won = m.winner_id === effectiveUserId;
                label = `vs ${opponentName}`;
                if (m.winner_id) label += won ? " — Won" : " — Lost";
              } else {
                label = `${p1Name} vs ${p2Name}`;
              }

              const needsMyConfirmation = !m.confirmed && !m.disputed && isParticipant && m.submitted_by !== effectiveUserId;

              return (
                <Card key={m.id} className={cn("p-2.5 flex items-center justify-between gap-2", needsMyConfirmation && "border-primary/40 bg-primary/5")}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-muted-foreground">{m.match_date}</span>
                      {m.score && <Badge variant="outline" className="text-[10px] tabular-nums">{m.score}</Badge>}
                    </div>
                  </div>
                  {needsMyConfirmation ? (
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-100" onClick={() => handleConfirmMatch(m.id)}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleDisputeMatch(m.id)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <Badge
                      variant={m.confirmed ? "default" : m.disputed ? "destructive" : "secondary"}
                      className="text-[10px] shrink-0"
                    >
                      {m.confirmed ? "Confirmed" : m.disputed ? "Disputed" : "Pending"}
                    </Badge>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="p-3 text-center text-sm text-muted-foreground">
            No match results yet
          </Card>
        )}
      </motion.div>

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
              const opponentId = effectiveUserId ? (s.player_a === effectiveUserId ? s.player_b : s.player_a) : null;
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
          memberId={activeMember?.id}
          activeMemberUserId={activeMember?.user_id ?? null}
          challenges={challenges}
          onViewAll={() => navigate("/challenges")}
        />
      </div>

      {/* My Tournaments */}
      <div className="px-4 mt-4">
        <MyChampionships />
      </div>

      {/* Club Events */}
      <div className="px-4 mt-4">
        <CreateClubEvent />
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

      {/* Support — bottom of page */}
      <div className="px-4 mt-5 mb-4">
        <Button variant="outline" className="w-full justify-between h-11 px-3" onClick={() => navigate("/support")}>
          <span className="inline-flex items-center gap-2">
            <LifeBuoy className="w-4 h-4" />
            Support
          </span>
          <ChevronRight className="w-4 h-4 opacity-70" />
        </Button>
      </div>

    </div>
  );
}
