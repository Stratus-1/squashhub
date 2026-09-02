import { PageHeader } from "@/components/PageHeader";
import { useCapabilities } from "@/hooks/use-club-capabilities";
import { fromExt } from "@/lib/supabase-ext";

import { CreateClubEvent } from "@/components/CreateClubEvent";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SEO } from "@/components/SEO";
import { Users } from "lucide-react";

import { MemberOnboardingWizard } from "@/components/MemberOnboardingWizard";
import { MembershipIntroModal } from "@/components/MembershipIntroModal";
import { MyChampionships } from "@/components/MyChampionships";


import { WelcomeBanner } from "@/components/WelcomeBanner";
import { JoinLeagueAssociationCard } from "@/components/JoinLeagueAssociationCard";
import { CaptainInviteTeamCard } from "@/components/CaptainInviteTeamCard";
import { SubscriptionDuePrompt } from "@/components/club-admin/SubscriptionDuePrompt";
import { SlaOutstandingPrompt } from "@/components/club-admin/SlaOutstandingPrompt";
import AssociationDashboard from "@/pages/AssociationDashboard";
import { ProfileCompletionMeter } from "@/components/ProfileCompletionMeter";
import { ClubStatsCard } from "@/components/ClubStatsCard";
import { ClubSetsPlayedCard } from "@/components/ClubSetsPlayedCard";
import { DashboardMyStatsCard } from "@/components/DashboardMyStatsCard";
import { DashboardSportyhqCard } from "@/components/DashboardSportyhqCard";
import { DashboardRankingPointsCard } from "@/components/DashboardRankingPointsCard";
import { FaceEnrolmentDialog } from "@/components/FaceEnrolmentDialog";
import { Calendar, CalendarDays, Trophy, ChevronRight, Loader2, LifeBuoy, Settings, ShieldCheck, Wallet, Crosshair, History, Check, X, Wine, Play, GraduationCap } from "lucide-react";
import { hasActiveMarkerSession } from "@/lib/marker-storage";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMyScheduledMatches, useProfile, useBookings, useMyBookings, useLadder, useMyRoles } from "@/hooks/use-data";
import { useMyClub, useIsClubAdmin, useMyClubMember, useMyLeagueRegistration } from "@/hooks/use-club";
import { DashboardDesktop } from "@/components/DashboardDesktop";
import { LeagueWeekAvailabilityCard } from "@/components/LeagueWeekAvailabilityCard";
import { DashboardTournamentInvitesCard } from "@/components/DashboardTournamentInvitesCard";
import { LinkExistingMembershipCard } from "@/components/LinkExistingMembershipCard";

import DebitOrderPromptCard from "@/components/DebitOrderPromptCard";
import { DashboardDeviceControls } from "@/components/DashboardDeviceControls";
import { DashboardWifiCard } from "@/components/DashboardWifiCard";
import { DashboardRouterCard } from "@/components/DashboardRouterCard";
import { MemberSuspensionBanner } from "@/components/MemberSuspensionBanner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMyPermissions, useMemberHasAdminAccess } from "@/hooks/use-club-permissions";
import { useClubContext } from "@/contexts/ClubContext";
import { useChampDailyToast } from "@/hooks/use-champ-daily-toast";
import { useChampBookingReminder } from "@/hooks/use-champ-booking-reminder";
import { useMemberContext } from "@/contexts/MemberContext";
import { format, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


export default function Dashboard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { user } = useAuth();
  const { club: contextClub, subdomain } = useClubContext();
  const { linkedMembers, activeMember, switchMember, effectiveUserId, isViewingAs } = useMemberContext();
  const showFamilySwitcher = linkedMembers.length > 1;
  const { data: profile, isLoading } = useProfile();
  const { data: clubData, isLoading: isClubLoading } = useMyClub();
  const {
    data: myClubMember,
    isLoading: isClubMemberLoading,
    isError: isClubMemberError,
  } = useMyClubMember();
  const effectiveClub = clubData?.club || contextClub;
  const isClubAdmin = useIsClubAdmin();
  const myPermissions = useMyPermissions();
  // While viewing as another member, reflect THAT member's own admin rights
  // (club role 'admin', full-admin flag, or granted permission slugs) instead
  // of the viewer's — so you can verify what they actually see.
  const viewedMemberHasAdmin = useMemberHasAdminAccess(isViewingAs ? activeMember?.id : undefined);
  const hasAnyAdminAccess = isViewingAs
    ? viewedMemberHasAdmin
    : (isClubAdmin || myPermissions.size > 0);
  const myMemberId = activeMember?.id || null;
  const { data: myPrimaryLeagueReg } = useMyLeagueRegistration(myMemberId || undefined);
  const clubId = effectiveClub?.id || clubData?.club?.id;
  const { data: ladder } = useLadder(clubId);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: todayBookings } = useBookings(todayStr, clubId);
  const { data: myBookings } = useMyBookings(effectiveUserId, { memberId: myMemberId });
  const { data: myScheduledMatches } = useMyScheduledMatches(effectiveUserId);

  // Detect in-progress marker session (re-check on focus / route changes)
  const [hasMarkerSession, setHasMarkerSession] = useState(() => hasActiveMarkerSession());
  useEffect(() => {
    const check = () => setHasMarkerSession(hasActiveMarkerSession());
    check();
    window.addEventListener("focus", check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", check);
    };
  }, [location.pathname]);

  // Check if club has any league associations (to show/hide League Games tile)
  const { data: clubLeagueAssociations } = useQuery({
    queryKey: ["league-associations-presence", clubId],
    queryFn: async () => {
      if (!clubId) return [];
      const { data, error } = await fromExt("league_associations").select("id").eq("club_id", clubId!).limit(1);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
  });
  // Capability gating — a club only sees the modules it actually uses.
  const { enabled: clubCaps, hasRows: hasCapRows } = useCapabilities(clubId);
  const capOn = (slug: string) => !hasCapRows || clubCaps.has(slug);
  const bookingsEnabled = capOn("bookings");
  const ladderEnabled = capOn("ladder");
  const tournamentsEnabled = capOn("tournaments");
  const eventsEnabled = capOn("events");
  const barEnabled = capOn("bar");
  const hasLeagues = capOn("leagues") && (clubLeagueAssociations || []).length > 0;
  // Nightly knockout round-up toast ("Well done with your wins" / "Sorry to see you go").
  useChampDailyToast(clubId, tournamentsEnabled);
  // "Please make your court booking for your next upcoming game" nudge.
  useChampBookingReminder(clubId, myMemberId, tournamentsEnabled);
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

  // My tournament W/L (club_champs_matches) — merged into My Stats alongside ladder/league stats.
  const { data: tournamentStats } = useQuery({
    queryKey: ["my-tournament-stats", myMemberId],
    queryFn: async () => {
      if (!myMemberId) return { wins: 0, losses: 0, played: 0 };
      const { data, error } = await fromExt("club_champs_matches")
        .select("status, is_bye, winner_member_id, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id")
        .eq("status", "completed")
        .or(
          `player_a_member_id.eq.${myMemberId},player_b_member_id.eq.${myMemberId},partner_a_member_id.eq.${myMemberId},partner_b_member_id.eq.${myMemberId}`,
        );
      if (error) throw error;
      let wins = 0, losses = 0;
      for (const m of (data || []) as any[]) {
        if (m.is_bye) continue;
        const onSideA = m.player_a_member_id === myMemberId || m.partner_a_member_id === myMemberId;
        const onSideB = m.player_b_member_id === myMemberId || m.partner_b_member_id === myMemberId;
        if (!onSideA && !onSideB) continue;
        const winner = m.winner_member_id;
        if (!winner) continue;
        const winnerOnSideA = winner === m.player_a_member_id || winner === m.partner_a_member_id;
        const iWon = (onSideA && winnerOnSideA) || (onSideB && !winnerOnSideA);
        if (iWon) wins++; else losses++;
      }
      return { wins, losses, played: wins + losses };
    },
    enabled: !!myMemberId,
  });



  // My upcoming league fixtures (next 30 days)
  // Priority 1: fixtures where I'm in the lineup (filled-up team)
  // Priority 2 (fallback): fixtures for any league I'm registered in
  const { data: myLeagueFixtures } = useQuery({
    queryKey: ["my-upcoming-league-fixtures", clubId, myMemberId, (myPrimaryLeagueReg as any)?.league_id || null],
    queryFn: async () => {
      if (!clubId || !myMemberId) return [] as any[];

      const myLeagueCodes = new Set<string>();
      const platformAssocIds = new Set<string>();
      const clubPrefixes = new Set<string>();

      const primaryCode = (myPrimaryLeagueReg as any)?.leagues?.code as string | undefined;
      if (primaryCode) {
        const upperCode = primaryCode.toUpperCase();
        myLeagueCodes.add(upperCode);
        const m = upperCode.match(/^([A-Za-z]+)/);
        if (m) clubPrefixes.add(m[1].toUpperCase());
      }

      const primaryAssociationId = (myPrimaryLeagueReg as any)?.leagues?.association_id as string | undefined;
      if (primaryAssociationId) {
        const { data: assocRow } = await fromExt("league_associations")
          .select("platform_association_id")
          .eq("id", primaryAssociationId)
          .maybeSingle();
        const pa = (assocRow as any)?.platform_association_id as string | undefined;
        if (pa) platformAssocIds.add(pa);
      }

      const today = format(new Date(), "yyyy-MM-dd");
      const horizon = format(new Date(Date.now() + 30 * 86400000), "yyyy-MM-dd");

      // 1) Fetch all my lineup fixtures (highest priority — I'm filled in)
      const { data: myLineups } = await supabase
        .from("league_fixture_lineups")
        .select("fixture_id")
        .eq("club_member_id", myMemberId);
      const lineupFixtureIds = [...new Set(((myLineups || []) as any[]).map((l) => l.fixture_id as string))];

      let lineupFixtures: any[] = [];
      if (lineupFixtureIds.length > 0) {
        const { data: lfx } = await supabase
          .from("platform_league_fixtures")
          .select("id, fixture_date, venue_name, home_team_code, away_team_code, division, association_id")
          .in("id", lineupFixtureIds)
          .gte("fixture_date", today)
          .lte("fixture_date", horizon);
        lineupFixtures = (lfx || []).map((f: any) => ({ ...f, inLineup: true, inMyLeague: true }));
      }

      // 2) Fallback: registered-league fixtures (if user has registrations)
      let regFixtures: any[] = [];
      if (platformAssocIds.size > 0 && clubPrefixes.size > 0) {
        const { data: fx } = await supabase
          .from("platform_league_fixtures")
          .select("id, fixture_date, venue_name, home_team_code, away_team_code, division, association_id")
          .in("association_id", [...platformAssocIds])
          .gte("fixture_date", today)
          .lte("fixture_date", horizon)
          .order("fixture_date");

        regFixtures = (fx || [])
          .filter((f: any) => {
            const home = (f.home_team_code || "").toUpperCase();
            const away = (f.away_team_code || "").toUpperCase();
            // Only include fixtures for the exact league(s) I'm registered in
            return myLeagueCodes.has(home) || myLeagueCodes.has(away);
          })
          .map((f: any) => ({ ...f, inLineup: false, inMyLeague: true }));
      }

      // Merge — lineup fixtures take precedence (de-dupe by id)
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const f of [...lineupFixtures, ...regFixtures]) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        merged.push(f);
      }

      // 3) Tournament matches linked to a league where I'm a player
      const { data: champMatches } = await fromExt("club_champs_matches")
        .select("id, scheduled_date, scheduled_time, court_id, player_a_member_id, player_b_member_id, champ_id, player_a:player_a_member_id(name), player_b:player_b_member_id(name), club_champs:champ_id(name, source_league_id, source_league_ids, club_id)")
        .or(`player_a_member_id.eq.${myMemberId},player_b_member_id.eq.${myMemberId}`)
        .gte("scheduled_date", today)
        .lte("scheduled_date", horizon);
      const champRows = ((champMatches || []) as any[])
        .filter((m) => {
          const c = m.club_champs;
          if (!c || c.club_id !== clubId) return false;
          return !!c.source_league_id || (Array.isArray(c.source_league_ids) && c.source_league_ids.length > 0);
        })
        .map((m) => {
          const isA = m.player_a_member_id === myMemberId;
          const opponent = isA ? (m.player_b?.name || "TBD") : (m.player_a?.name || "TBD");
          return {
            id: `champ-${m.id}`,
            fixture_date: m.scheduled_date,
            fixture_time: m.scheduled_time,
            home_team_code: "You",
            away_team_code: opponent,
            venue_name: null,
            division: m.club_champs?.name || "Tournament",
            inLineup: true,
            inMyLeague: true,
            isTournament: true,
            champId: m.champ_id,
          };
        });
      for (const f of champRows) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        merged.push(f);
      }

      return merged.sort((a: any, b: any) => {
        const dateCmp = String(a.fixture_date || "").localeCompare(String(b.fixture_date || ""));
        if (dateCmp !== 0) return dateCmp;
        return String(a.fixture_time || "99:99").localeCompare(String(b.fixture_time || "99:99"));
      });
    },
    enabled: !!clubId && !!myMemberId,
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

  // Map both user_id AND member_id to names for flexible resolution
  const matchPlayerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    // First load profile names (fallback)
    for (const p of matchPlayerProfiles || []) map.set(p.id, p.name || "Unknown");
    // Then overlay member names (priority) — map both user_id and member id
    for (const m of (matchMemberNames || []) as any[]) {
      if (m.name) {
        if (m.user_id) map.set(m.user_id, m.name);
        if (m.id) map.set(m.id, m.name); // Also map by member ID for visitors/unlinked
      }
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
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [showFaceEnrolment, setShowFaceEnrolment] = useState(false);
  const [showIntro, setShowIntro] = useState(false);

  const { data: myRoles } = useMyRoles();
  const isSuperAdmin = (myRoles || []).includes("admin") || (myRoles || []).includes("moderator");

  useEffect(() => {
    if (isLoading || isClubLoading || isClubMemberLoading || isClubMemberError || !profile) return;

    // Super admins (platform-level) can browse any club without being forced to onboard.
    if (isSuperAdmin) return;

    // Club admins (captains/admins) skip the member onboarding wizard.
    // Only show the membership intro modal to admins who are themselves
    // not yet fully registered (no member number yet) — existing admins
    // who already have a member number have nothing to onboard to.
    const isMemberAdmin =
      myClubMember?.role === "captain" || myClubMember?.role === "admin" ||
      clubData?.membership?.role === "captain" || clubData?.membership?.role === "admin";

    if (isMemberAdmin) {
      const adminNeedsIntro = !!effectiveClub && !!myClubMember && !myClubMember.club_member_number;
      if (adminNeedsIntro) {
        const introKey = `membershipIntroSeen:${effectiveClub?.id || "default"}:${profile.id}`;
        const seen = typeof window !== "undefined" && localStorage.getItem(introKey) === "1";
        if (!seen) {
          setShowIntro(true);
        }
      }
      return;
    }

    const hasClub = !!effectiveClub;

    // Visitors never see the member onboarding wizard — they registered as
    // visitors and have no member number / SA ID to provide.
    const isVisitorMember =
      (myClubMember?.role as string | undefined) === "visitor" ||
      myClubMember?.fee_category?.name?.trim().toLowerCase() === "visitor";
    if (isVisitorMember) return;

    // In-progress visitor registration: user clicked "Sign up with Google" on
    // the Visitor tab, returned from OAuth, but hasn't completed the visitor
    // form yet (no first name/last name/home club → server didn't auto-create
    // the visitor row). Send them back to /auth to finish visitor details
    // instead of forcing them through member onboarding at this club.
    if (hasClub && !myClubMember && typeof window !== "undefined") {
      const pendingKey = `sh.pending_visitor_registration.${effectiveClub?.id || ""}`;
      const raw = localStorage.getItem(pendingKey);
      if (raw) {
        // Only honour pending visitor payloads that were saved recently
        // (< 30 min). Older payloads are abandoned attempts and must not
        // keep pushing brand-new members into the visitor flow.
        let fresh = false;
        try {
          const parsed = JSON.parse(raw);
          const savedAt = Number(parsed?.saved_at || 0);
          fresh = !!savedAt && Date.now() - savedAt < 30 * 60 * 1000;
        } catch { /* ignore */ }
        if (fresh) {
          navigate("/auth?intent=visitor", { replace: true });
          return;
        }
        localStorage.removeItem(pendingKey);
      }
    }

    const legacyNeedsOnboarding =
      !profile.name || profile.name === "" || profile.name === "New Player";

    // Only show onboarding if the member hasn't been assigned a member number yet
    // (member number is assigned during the onboarding wizard completion)
    const missingMemberData =
      hasClub &&
      myClubMember &&
      !myClubMember.club_member_number;

    // If no club member record at all but club exists, they may need to register.
    // BUT: if this user already has a `club_members` row at some OTHER club
    // (e.g. they're an admin at Riverside visiting CSI), they're not a "new
    // member" here — they arrived via a foreign login (usually Google) and
    // should be sent to /auth to register as a visitor, not pushed through
    // member onboarding for this club.
    // If no club member record at all but club exists, they may need to register.
    // NOTE: Users who have no membership (member or visitor) at this club are
    // now blocked at the App root by <SubdomainMembershipGate/>, so this
    // branch only runs on the root host (no subdomain) or during a brief
    // context race. Never navigate to /auth here — that caused a flicker loop.
    const noMemberRecord = hasClub && !myClubMember && !isClubMemberLoading;

    if (noMemberRecord) {
      if (!onboardingDone) {
        const introKey = `membershipIntroSeen:${effectiveClub?.id || "default"}:${profile.id}`;
        const seen = typeof window !== "undefined" && localStorage.getItem(introKey) === "1";
        if (!seen) setShowIntro(true); else setShowOnboarding(true);
      }
      return;
    }


    if ((legacyNeedsOnboarding || missingMemberData) && !onboardingDone) {

      // Show the intro modal first (once per club per user); wizard opens after dismissal
      const introKey = `membershipIntroSeen:${effectiveClub?.id || "default"}:${profile.id}`;
      const seen = typeof window !== "undefined" && localStorage.getItem(introKey) === "1";
      if (!seen) {
        setShowIntro(true);
      } else {
        setShowOnboarding(true);
      }
    }

  }, [
    isLoading,
    isClubLoading,
    isClubMemberLoading,
    isClubMemberError,
    profile,
    effectiveClub,
    myClubMember,
    clubData,
    onboardingDone,
    isSuperAdmin,
  ]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // Delegate to dedicated dashboard for association tenants
  if ((effectiveClub as any)?.tenant_type === "association") {
    return <AssociationDashboard />;
  }

  // Desktop dashboard — keeps mobile layout below untouched
  if (!isMobile) {
    // Ladder entry merges NSA + internal league stats; add tournament W/L for a full picture.
    const myLadderEntry = (ladder || []).find((p: any) =>
      (myMemberId && p.club_member_id === myMemberId) || (user?.id && (p.user_id === user.id || p.id === user.id))
    ) as any;
    const ladderWins = myLadderEntry?.wins ?? 0;
    const ladderLosses = myLadderEntry?.losses ?? 0;
    const ladderPlayed = myLadderEntry?.matches_played ?? (ladderWins + ladderLosses);
    const wins = ladderWins + (tournamentStats?.wins ?? 0);
    const losses = ladderLosses + (tournamentStats?.losses ?? 0);
    const played = ladderPlayed + (tournamentStats?.played ?? 0);
    const winRate = played > 0 ? (wins / played) * 100 : 0;
    const courtsUsed = new Set((myBookings || []).map((b: any) => b.court_id)).size;

    return (
      <div className="relative">
        <SEO title="Member Dashboard" description="Your squash hub — stats and bookings." path="/" noIndex />
        <MembershipIntroModal
          open={showIntro}
          clubName={effectiveClub?.name}
          subdomain={subdomain || undefined}
          onClose={() => {
            const introKey = `membershipIntroSeen:${effectiveClub?.id || "default"}:${profile?.id}`;
            try { localStorage.setItem(introKey, "1"); } catch {}
            setShowIntro(false);
            setShowOnboarding(true);
          }}
        />
        <MemberOnboardingWizard
          open={showOnboarding}
          onComplete={() => {
            setShowOnboarding(false);
            setOnboardingDone(true);
            setTimeout(() => { window.location.href = "/my-account?onboarding=payment"; }, 300);
          }}
        />
        <FaceEnrolmentDialog open={showFaceEnrolment} onClose={() => setShowFaceEnrolment(false)} />

        <PageHeader
          title={effectiveClub?.name || "SquashHub"}
          subtitle={
            ((myClubMember?.role as string | undefined) === "visitor" ||
              myClubMember?.fee_category?.name?.trim().toLowerCase() === "visitor")
              ? `Welcome back to visiting our club, ${firstName}`
              : `Welcome back, ${firstName}`
          }
          showNotifications
          showProfile
          actionsOnly
        />

        {hasLeagues && (
          <div className="px-8 pt-3">
            <LeagueWeekAvailabilityCard />
          </div>
        )}

        <div className="px-8 pt-3">
          {((activeMember as any)?.is_pending_approval || (myClubMember as any)?.is_pending_approval) && (
            <div className="mb-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2">
              <p className="text-[13px] font-semibold text-amber-700 dark:text-amber-400">
                Your membership application is pending
              </p>
              <p className="text-[11px] text-muted-foreground">
                You can view and pay your fees below. Full club access (roster, bookings, leagues) unlocks once the
                club activates your membership.
              </p>
            </div>
          )}
          <div className="mb-3"><LinkExistingMembershipCard /></div>

          <DashboardTournamentInvitesCard />
          <div className="mt-3"><DebitOrderPromptCard clubMemberId={myMemberId} /></div>
          {myPrimaryLeagueReg?.is_captain && myClubMember?.id && (
            <div className="mt-3">
              <CaptainInviteTeamCard clubMemberId={myClubMember.id} />
            </div>
          )}
          {clubId && (
            <div className="mt-3"><SlaOutstandingPrompt clubId={clubId} /></div>
          )}
          {(isClubAdmin || isSuperAdmin) && clubId && (
            <div className="mt-3"><SubscriptionDuePrompt clubId={clubId} /></div>
          )}
          {(isClubAdmin || isSuperAdmin) && clubId && (
            <div className="mt-3">
              <CaptainInviteTeamCard mode="admin" clubId={clubId} />
            </div>
          )}

          <div className="mt-3">
            <DashboardRankingPointsCard clubId={clubId} memberId={myMemberId} />
          </div>
        </div>


        <DashboardDesktop
          clubName={effectiveClub?.name || "SquashHub"}
          clubLogoUrl={(effectiveClub as any)?.logo_url || null}
          clubId={clubId}
          firstName={firstName}
          played={played}
          wins={wins}
          losses={losses}
          winRate={winRate}
          rank={myLadderPosition}
          totalBookings={(myBookings || []).length}
          courtsUsed={courtsUsed}
          myBookings={myBookings || []}
          recentMatches={recentMatches || []}
          matchPlayerNameMap={matchPlayerNameMap}
          effectiveUserId={effectiveUserId}
          myMemberId={myMemberId}
          myLeagueFixtures={myLeagueFixtures || []}
          hasLeagues={hasLeagues}
          honestyBarEnabled={barEnabled && !!(effectiveClub as any)?.honesty_bar_enabled}
          hasAnyAdminAccess={hasAnyAdminAccess}
          isVisitor={(myClubMember?.role as string | undefined) === "visitor" || myClubMember?.fee_category?.name?.trim().toLowerCase() === "visitor"}
          eventsSlot={<CreateClubEvent />}
        />
      </div>
    );
  }

  return (
    <div className="bottom-nav-safe relative">
      <SEO title="Member Dashboard" description="Your squash hub — stats and bookings." path="/" noIndex />

      <MembershipIntroModal
        open={showIntro}
        clubName={effectiveClub?.name}
        subdomain={subdomain || undefined}
        onClose={() => {
          const introKey = `membershipIntroSeen:${effectiveClub?.id || "default"}:${profile?.id}`;
          try { localStorage.setItem(introKey, "1"); } catch {}
          setShowIntro(false);
          setShowOnboarding(true);
        }}
      />

      <MemberOnboardingWizard
        open={showOnboarding}
        onComplete={() => {
          setShowOnboarding(false);
          setOnboardingDone(true);
          // Send the new member into the ordinary account top-up/payment flow.
          // This is deliberately separate from recurring-card mandate setup.
          // Hard reload ensures the newly-created fees and member number load.
          setTimeout(() => { window.location.href = "/my-account?onboarding=payment"; }, 300);
        }}
      />
      

      <PageHeader title={effectiveClub?.name || "SquashHub"} subtitle={((myClubMember?.role as string | undefined) === "visitor" || myClubMember?.fee_category?.name?.trim().toLowerCase() === "visitor") ? `Welcome back to visiting our club, ${firstName}` : `Welcome back, ${firstName}`} showNotifications showProfile />

      

      {/* Prompt members to join an affiliated league association */}
      <JoinLeagueAssociationCard clubId={clubId} variant="banner" />

      {/* Confirm next week's league availability */}
      {hasLeagues && (
        <div className="px-4 mt-3">
          <LeagueWeekAvailabilityCard />
        </div>
      )}

      <div className="px-4 mt-3">
        <div className="mb-3"><LinkExistingMembershipCard /></div>
        <DashboardTournamentInvitesCard />
        <div className="mt-3"><DebitOrderPromptCard clubMemberId={myMemberId} /></div>
      </div>


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
            if (action === "edit-then-account") openProfile("/profile?edit=1&next=account");
            if (action === "account") navigate("/my-account");
            if (action === "face") setShowFaceEnrolment(true);
          }}
        />
      </div>

      <div className="px-4 mt-3 space-y-3">
        {(() => {
          const myLadderEntry = (ladder || []).find((p: any) =>
            (myMemberId && p.club_member_id === myMemberId) ||
            (user?.id && (p.user_id === user.id || p.id === user.id))
          ) as any;
          const ladderWins = myLadderEntry?.wins ?? 0;
          const ladderLosses = myLadderEntry?.losses ?? 0;
          const ladderPlayed = myLadderEntry?.matches_played ?? (ladderWins + ladderLosses);
          const wins = ladderWins + (tournamentStats?.wins ?? 0);
          const losses = ladderLosses + (tournamentStats?.losses ?? 0);
          const played = ladderPlayed + (tournamentStats?.played ?? 0);
          const winRate = played > 0 ? (wins / played) * 100 : 0;
          const courtsUsed = new Set((myBookings || []).map((b: any) => b.court_id)).size;
          return (
            <DashboardMyStatsCard
              played={played}
              wins={wins}
              losses={losses}
              winRate={winRate}
              rank={myLadderPosition}
              totalBookings={(myBookings || []).length}
              courtsUsed={courtsUsed}
            />
          );
        })()}
        <DashboardSportyhqCard
          memberId={myMemberId}
          personId={(activeMember as any)?.person_id ?? (myClubMember as any)?.person_id ?? null}
        />
        <DashboardRankingPointsCard clubId={clubId} memberId={myMemberId} />
      </div>




      {/* Primary Actions — Book, Ladder, Profile */}
      <div className="px-4 mt-4">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {bookingsEnabled && (
<Button className="flex-col h-auto py-3 gap-1.5 bg-primary text-primary-foreground border border-border bg-emerald-600 hover:bg-emerald-700 text-white border-0" onClick={() => navigate("/bookings")}>
            <Calendar className="w-5 h-5" />
            <span className="text-xs font-medium">Court Bookings</span>
          </Button>
)}
          {ladderEnabled && (
<Button variant="outline" className="flex-col h-auto py-3 gap-1.5 bg-card text-foreground border-border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20" onClick={() => navigate("/ladder")}>
            <Trophy className="w-5 h-5" />
            <span className="text-xs font-medium leading-tight text-center">Club Ladder</span>
          </Button>
)}
          {/* Live scoring. Competition games are marked from their own screens
              (league fixture, tournament game, booking), so this tile only
              leads: while a game is being scored. Otherwise it sits at the end
              of the grid as the entry point for social / ad-hoc games. */}
          {hasMarkerSession && (
            <Button
              variant="outline"
              className="flex-col h-auto py-3 gap-1.5 bg-card text-foreground border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25 ring-2 ring-emerald-500/40 animate-pulse"
              onClick={() => navigate("/match-marker")}
            >
              <Play className="w-5 h-5" />
              <span className="text-xs font-medium leading-tight text-center">Resume Marking</span>
            </Button>
          )}

          {eventsEnabled && (
<Button variant="outline" className="flex-col h-auto py-3 gap-1.5 bg-card text-foreground border-border border-pink-500/40 bg-pink-500/10 text-pink-700 dark:text-pink-400 hover:bg-pink-500/20" onClick={() => navigate("/events")}>
            <CalendarDays className="w-5 h-5" />
            <span className="text-xs font-medium leading-tight text-center">Events</span>
          </Button>
)}
          {hasLeagues && (
            <Button variant="outline" className="flex-col h-auto py-3 gap-1.5 bg-card text-foreground border-border border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-500/20" onClick={() => navigate("/league-games")}>
              <Trophy className="w-5 h-5" />
              <span className="text-xs font-medium leading-tight text-center">Leagues</span>
            </Button>
          )}
          {tournamentsEnabled && (
<Button variant="outline" className="flex-col h-auto py-3 gap-1.5 bg-card text-foreground border-border border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20" onClick={() => navigate("/tournaments")}>
            <Trophy className="w-5 h-5" />
            <span className="text-xs font-medium leading-tight text-center">Tournaments</span>
          </Button>
)}
          {effectiveClub && barEnabled && (effectiveClub as any)?.honesty_bar_enabled && (
            <Button
              variant="outline"
              className="flex-col h-auto py-3 gap-1.5 bg-card text-foreground border-border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-500/20"
              onClick={() => navigate("/honesty-bar")}
              title="Buy drinks & snacks — pay now or charge to your member account"
            >
              <Wine className="w-5 h-5" />
              <span className="text-xs font-medium leading-tight text-center">Bar / POS</span>
            </Button>
          )}
          {/* My Profile still desktop-only; My Account shown on all viewports per request */}
          <Button variant="outline" className="flex-col h-auto py-3 gap-1.5 bg-card text-foreground border-border border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-400 hover:bg-teal-500/20" onClick={() => navigate("/my-account")}>
            <Wallet className="w-5 h-5" />
            <span className="text-xs font-medium leading-tight text-center">My Account</span>
          </Button>
          <Button variant="outline" className="hidden sm:flex flex-col h-auto py-3 gap-1.5 bg-card text-foreground border-border border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-500/20" onClick={() => openProfile("/profile?edit=1")}>
            <Settings className="w-5 h-5" />
            <span className="text-xs font-medium leading-tight text-center">My Profile</span>
          </Button>
          <DashboardWifiCard asTile />
          {!hasMarkerSession && (
            <Button
              variant="outline"
              className="flex-col h-auto py-3 gap-1.5 bg-card text-foreground border-border border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400 hover:bg-violet-500/20"
              onClick={() => navigate("/match-marker")}
              title="Score a social, ladder or practice game live — league and tournament games are marked from their own fixture screens"
            >
              <Crosshair className="w-5 h-5" />
              <span className="text-xs font-medium leading-tight text-center">Score a Match</span>
            </Button>
          )}
          <Button variant="outline" className="flex-col h-auto py-3 gap-1.5 bg-card text-foreground border-border border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400 hover:bg-sky-500/20" onClick={() => navigate("/help")}>
            <GraduationCap className="w-5 h-5" />
            <span className="text-xs font-medium leading-tight text-center">Help &amp; Tutorials</span>
          </Button>
          {hasAnyAdminAccess && (
            <Button variant="outline" className="flex-col h-auto py-3 gap-1.5 bg-card text-foreground border-border border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400 hover:bg-orange-500/20" onClick={() => navigate("/club-admin")}>
              <ShieldCheck className="w-5 h-5" />
              <span className="text-xs font-medium leading-tight text-center">Club Admin</span>
            </Button>
          )}
        </div>
      </div>


      {/* Arrears / suspension banner (always visible if applicable) */}
      <MemberSuspensionBanner />

      {/* Club Controls — lights, access and gadgets in one grouped section */}
      <div className="px-4 mt-2">
        <DashboardDeviceControls />
      </div>

      {/* Club internet / data bundle status (club admins only) */}
      <div className="px-4 mt-2">
        <DashboardRouterCard />
      </div>




      {/* My Upcoming League Games — dedicated section */}
      {hasLeagues && myLeagueFixtures && myLeagueFixtures.length > 0 && (
        <motion.div
          className="px-4 mt-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold font-heading flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-primary" /> My Upcoming League & Tournament Games
            </h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => navigate("/league-games")}>
                Leagues
              </Button>
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => navigate("/tournaments")}>
                Tournaments <ChevronRight className="w-3 h-3 ml-0.5" />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            {myLeagueFixtures.slice(0, 5).map((f: any) => (
              <Card
                key={`lf-${f.id}`}
                className={cn(
                  "p-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-accent/50 transition-colors",
                  f.inLineup ? "border-2 border-primary bg-primary/10" : "border-primary/40 bg-primary/5"
                )}
                onClick={() => navigate(f.isTournament ? `/club-champs/${f.champId}` : `/league-games/${f.id}`)}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {f.home_team_code} <span className="text-muted-foreground text-xs">vs</span> {f.away_team_code}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {format(parseISO(f.fixture_date), "EEE dd MMM")}
                    {f.fixture_time ? ` · ${String(f.fixture_time).slice(0, 5)}` : ""}
                    {f.venue_name ? ` · ${f.venue_name}` : ""}
                    {f.division ? ` · ${f.division}` : ""}
                  </p>
                </div>
                <Badge
                  variant={f.inLineup ? "default" : "secondary"}
                  className="text-[10px] shrink-0"
                >
                  {f.inLineup ? "You're playing" : "Your league"}
                </Badge>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {/* Club at-a-glance stats */}
      <div className="px-4 mt-4 space-y-3">
        <ClubStatsCard clubId={clubId} />
        <ClubSetsPlayedCard clubId={clubId} />
      </div>

      {/* My Upcoming Bookings */}
      <motion.div
        className="px-4 mt-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold font-heading">My Upcoming Bookings</h2>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/bookings")}>
            View all <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
        {myBookings && myBookings.length > 0 ? (
          <div className="space-y-1.5">
            {(myBookings || []).slice(0, 3).map((booking) => (
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
          {(recentMatches?.length || 0) > 3 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowAllMatches((v) => !v)}>
              {showAllMatches ? "Show less" : `View all (${recentMatches.length})`} <ChevronRight className={cn("w-3 h-3 ml-1 transition-transform", showAllMatches && "rotate-90")} />
            </Button>
          )}
        </div>
        {recentMatches && recentMatches.length > 0 ? (
          <div className="space-y-1.5">
            {(showAllMatches ? recentMatches : recentMatches.slice(0, 3)).map((m: any) => {
              const isPlayerA = m.player_a === effectiveUserId || (myMemberId && m.player_a_member_id === myMemberId);
              const isPlayerB = m.player_b === effectiveUserId || (myMemberId && m.player_b_member_id === myMemberId);
              const isParticipant = isPlayerA || isPlayerB;
              const isSamePlayer = m.player_a && m.player_b && m.player_a === m.player_b;

              // Resolve names: try user_id first, then member_id
              let p1Name = matchPlayerNameMap.get(m.player_a) || matchPlayerNameMap.get(m.player_a_member_id) || null;
              let p2Name = matchPlayerNameMap.get(m.player_b) || matchPlayerNameMap.get(m.player_b_member_id) || null;

              // Parse names from notes for unresolved players (visitors, external players)
              if (m.notes) {
                if (!p1Name || (isSamePlayer)) {
                  const notesNames = m.notes.match(/Player\s*1[:\s]+([^.;\n]+)/i);
                  if (notesNames) p1Name = notesNames[1].trim();
                }
                if (!p2Name || (isSamePlayer)) {
                  const notesNames2 = m.notes.match(/Player\s*2[:\s]+([^.;\n]+)/i);
                  if (notesNames2) p2Name = notesNames2[1].trim();
                }
              }
              if (!p1Name) p1Name = "Player 1";
              if (!p2Name) p2Name = "Player 2";

              let label = "";
              if (isSamePlayer) {
                // Match recorded on behalf of others — show both names from notes
                const winnerNote = m.notes?.match(/Winner[:\s]+([^.;\n]+)/i);
                const winnerName = winnerNote ? winnerNote[1].trim() : null;
                label = `${p1Name} vs ${p2Name}`;
                if (winnerName) label += ` — ${winnerName} won`;
              } else if (isParticipant) {
                const opponentName = isPlayerA ? p2Name : p1Name;
                const won = m.winner_id === effectiveUserId || (myMemberId && m.winner_member_id === myMemberId);
                label = `vs ${opponentName}`;
                if (m.winner_id || m.winner_member_id) label += won ? " — Won" : " — Lost";
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

      {myPrimaryLeagueReg?.is_captain && myClubMember?.id && (
        <motion.div
          className="px-4 mt-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <CaptainInviteTeamCard clubMemberId={myClubMember.id} />
        </motion.div>
      )}

      {(isClubAdmin || isSuperAdmin) && clubId && (
        <motion.div
          className="px-4 mt-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <SubscriptionDuePrompt clubId={clubId} />
        </motion.div>
      )}

      {clubId && (
        <div className="px-4 mt-3">
          <SlaOutstandingPrompt clubId={clubId} />
        </div>
      )}

      {(isClubAdmin || isSuperAdmin) && clubId && (
        <motion.div
          className="px-4 mt-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <CaptainInviteTeamCard mode="admin" clubId={clubId} />
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
                    <span className="text-xs font-bold text-primary">{booking.court_name || booking.court_id}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {booking.player_name || "Unknown"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{booking.court_name || `Court ${booking.court_id}`}</p>
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

      {/* Support Tickets — bottom of page */}
      <div className="px-4 mt-5 mb-4">
        <Button className="w-full justify-between h-12 px-3" onClick={() => navigate("/support")}>
          <span className="inline-flex items-center gap-2 font-semibold">
            <LifeBuoy className="w-4 h-4" />
            Support Tickets
          </span>
          <span className="inline-flex items-center gap-1 text-xs opacity-90">
            New ticket
            <ChevronRight className="w-4 h-4" />
          </span>
        </Button>
        <p className="text-[11px] text-muted-foreground text-center mt-1.5">
          Stuck or got a permission issue? Open a ticket — attach a screenshot and we'll respond in-app.
        </p>
      </div>
      <FaceEnrolmentDialog open={showFaceEnrolment} onClose={() => setShowFaceEnrolment(false)} />
    </div>
  );
}
