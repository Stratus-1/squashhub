import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppleStatsCard } from "@/components/AppleStatsCard";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { NotificationsDropdown } from "@/components/NotificationsDropdown";
import { SEO } from "@/components/SEO";
import { absoluteUrl } from "@/lib/site";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar, Trophy, Swords,
  ChevronRight, Star, TrendingUp, ArrowUp, ArrowDown, Minus,
  Clock, Users, LogIn, Shield, UserRound, Leaf, Sun, Snowflake, Flower2
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBookings, useChallenges, useCourtBusyness, useHomeInsights, useLadder, useMyRoles, useProfile, usePublicLeaderboard } from "@/hooks/use-data";
import { differenceInCalendarDays, format } from "date-fns";
import { motion } from "framer-motion";
import heroBg from "@/assets/hero-bg.jpg";
import clubLogo from "@/assets/club-logo.png";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMemo, useState } from "react";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

type SeasonRow = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
  created_at: string;
};

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  court_id: number | null;
  capacity: number | null;
  rsvp_deadline: string | null;
  visibility: "public" | "members";
  status: "draft" | "published" | "cancelled";
  kind?: "club" | "social" | string;
  season_id?: string | null;
  created_by?: string | null;
};

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: ladder } = useLadder();
  const { data: publicLeaderboard } = usePublicLeaderboard(10);
  const { data: me } = useProfile();
  const { data: myChallenges } = useChallenges();
  const { data: myRoles } = useMyRoles();
  const { data: insights } = useHomeInsights(30);
  const { data: busyness } = useCourtBusyness(30);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: todayBookings } = useBookings(todayStr);

  const { data: myGames } = useQuery({
    queryKey: ["home", "my-games", user?.id],
    queryFn: async () => {
      if (!user) return [] as any[];

      const { data: bookings, error } = await (supabase as any)
        .from("bookings")
        .select("*")
        .eq("status", "active")
        .eq("is_blocked", false)
        .or(`user_id.eq.${user.id},opponent_id.eq.${user.id}`)
        .gte("date", todayStr)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(30);
      if (error) throw error;

      const ids = [
        ...new Set(
          (bookings || [])
            .flatMap((b: any) => [b.user_id, b.opponent_id])
            .filter(Boolean)
        ),
      ] as string[];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id,name,rank")
        .in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
      if (profilesError) throw profilesError;

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      return (bookings || []).map((b: any) => {
        const opponentId = b.user_id === user.id ? b.opponent_id : b.user_id;
        const opponentProfile = opponentId ? profileMap.get(opponentId) : null;
        const startTime = String(b.start_time || "").slice(0, 5);
        const endTime = String(b.end_time || "").slice(0, 5);
        return {
          ...b,
          court_name: b.court_id === 1 ? "Court 1" : "Court 2",
          start_hhmm: startTime,
          end_hhmm: endTime,
          opponent_id: opponentId,
          opponent_name: opponentProfile?.name || (opponentId ? "Unknown" : null),
          opponent_rank: opponentProfile?.rank ?? null,
        };
      });
    },
    enabled: !!user,
  });

  const upcomingGames = useMemo(() => {
    if (!user) return [];
    const now = new Date();
    const rows = (myGames || []) as any[];
    return rows
      .filter((b) => {
        if (!b?.date || !b?.start_hhmm) return false;
        const dt = new Date(`${b.date}T${b.start_hhmm}:00`);
        return Number.isFinite(dt.getTime()) && dt.getTime() >= now.getTime();
      })
      .slice(0, 5);
  }, [myGames, user]);

  const { data: recentResults } = useQuery({
    queryKey: ["home", "recent-results", user?.id],
    queryFn: async () => {
      if (!user) return [] as any[];
      const { data: matches, error } = await (supabase as any)
        .from("matches")
        .select("*")
        .or(`player_a.eq.${user.id},player_b.eq.${user.id}`)
        .order("match_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;

      const opponentIds = [
        ...new Set(
          (matches || [])
            .flatMap((m: any) => [m.player_a, m.player_b])
            .filter((id: string) => !!id && id !== user.id)
        ),
      ] as string[];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id,name,rank")
        .in("id", opponentIds.length > 0 ? opponentIds : ["00000000-0000-0000-0000-000000000000"]);
      if (profilesError) throw profilesError;

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      return (matches || []).map((m: any) => {
        const opponentId = m.player_a === user.id ? m.player_b : m.player_a;
        const opp = opponentId ? profileMap.get(opponentId) : null;
        return {
          ...m,
          opponent_id: opponentId,
          opponent_name: opp?.name || "Unknown",
          opponent_rank: opp?.rank ?? null,
          is_win: m.winner_id ? m.winner_id === user.id : null,
        };
      });
    },
    enabled: !!user,
  });

  const recentGamesWithResults = useMemo(() => {
    const rows = (recentResults || []) as any[];
    return rows
      .filter((m) => !!m?.score)
      .slice(0, 5);
  }, [recentResults]);

  const { data: activeSeason } = useQuery({
    queryKey: ["active-season"],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await (supabase as any)
        .from("seasons")
        .select("id,name,starts_on,ends_on,is_active,created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) {
        if ((error as any).code === "42P01") return null;
        throw error;
      }
      const row = (data || [])[0] as SeasonRow | undefined;
      return row || null;
    },
    enabled: !!user,
  });

  const { data: joinedActiveSeason } = useQuery({
    queryKey: ["season-membership", user?.id, activeSeason?.id],
    queryFn: async () => {
      if (!user || !activeSeason) return false;
      const { data, error } = await (supabase as any)
        .from("season_memberships")
        .select("season_id")
        .eq("season_id", activeSeason.id)
        .eq("user_id", user.id)
        .limit(1);
      if (error) {
        if ((error as any).code === "42P01") return false;
        throw error;
      }
      return (data || []).length > 0;
    },
    enabled: !!user && !!activeSeason?.id,
  });

  const { data: seasonMemberCount, isLoading: seasonMemberCountLoading } = useQuery({
    queryKey: ["season-members-count", activeSeason?.id],
    queryFn: async () => {
      if (!activeSeason?.id) return null as number | null;
      const { count, error } = await supabase
        .from("season_memberships")
        .select("user_id", { count: "exact", head: true })
        .eq("season_id", activeSeason.id);
      if (error) {
        if ((error as any).code === "42P01") return null;
        throw error;
      }
      return count ?? 0;
    },
    enabled: !!user && !!activeSeason?.id,
    staleTime: 30_000,
  });

  const { data: seasonSocials } = useQuery({
    queryKey: ["season-socials", activeSeason?.id],
    queryFn: async () => {
      if (!activeSeason) return [] as EventRow[];
      const { data, error } = await (supabase as any)
        .from("events")
        .select("*")
        .eq("status", "published")
        .eq("visibility", "members")
        .eq("kind", "social")
        .eq("season_id", activeSeason.id)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(10);
      if (error) {
        if ((error as any).code === "42703") return [] as EventRow[];
        throw error;
      }
      return (data || []) as EventRow[];
    },
    enabled: !!user && !!activeSeason?.id,
  });

  const socialIds = (seasonSocials || []).map((e) => e.id);
  const { data: mySocialRsvps } = useQuery({
    queryKey: ["my-social-rsvps", user?.id, activeSeason?.id, socialIds.join(",")],
    queryFn: async () => {
      if (!user || socialIds.length === 0) return new Map<string, string>();
      const { data, error } = await (supabase as any)
        .from("event_rsvps")
        .select("event_id,status")
        .eq("user_id", user.id)
        .in("event_id", socialIds);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const r of data || []) map.set(String(r.event_id), String(r.status));
      return map;
    },
    enabled: !!user && socialIds.length > 0,
  });

  const joinSeason = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)("join_active_season");
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      toast.success("Joined the season");
      await queryClient.invalidateQueries({ queryKey: ["season-membership", user?.id, activeSeason?.id] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not join season"),
  });

  const rsvpGoing = useMutation({
    mutationFn: async (eventId: string) => {
      if (!user) throw new Error("Not logged in");
      const { error } = await (supabase as any)
        .from("event_rsvps")
        .upsert({ event_id: eventId, user_id: user.id, status: "going", guests: 0 }, { onConflict: "event_id,user_id" });
      if (error) throw error;
      return eventId;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-social-rsvps", user?.id, activeSeason?.id, socialIds.join(",")] });
      toast.success("Joined social");
    },
    onError: (e: any) => toast.error(e?.message || "Could not RSVP"),
  });

  const [socialCreateOpen, setSocialCreateOpen] = useState(false);
  const [socialDraft, setSocialDraft] = useState({
    title: "",
    description: "",
    date: format(new Date(), "yyyy-MM-dd"),
    startTime: "18:00",
    endTime: "19:00",
    location: "Gordon's Bay Squash Club",
    capacity: "",
  });

  const createSocial = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not logged in");
      if (!canOpenAdmin) throw new Error("Only admins can create socials");
      if (!activeSeason?.id) throw new Error("No active season");
      const title = socialDraft.title.trim();
      if (!title) throw new Error("Please enter a title");
      const startsAt = new Date(`${socialDraft.date}T${socialDraft.startTime}:00`);
      const endsAt = socialDraft.endTime.trim() ? new Date(`${socialDraft.date}T${socialDraft.endTime}:00`) : null;
      if (!Number.isFinite(startsAt.getTime())) throw new Error("Invalid start time");
      if (endsAt && endsAt.getTime() < startsAt.getTime()) throw new Error("End time must be after start time");
      const capacity = socialDraft.capacity.trim() ? Number(socialDraft.capacity.trim()) : null;
      if (capacity != null && (!Number.isFinite(capacity) || capacity < 1 || capacity > 200)) throw new Error("Capacity must be 1–200");

      const { data, error } = await (supabase as any)
        .from("events")
        .insert({
          title,
          description: socialDraft.description.trim() || null,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt ? endsAt.toISOString() : null,
          location: socialDraft.location.trim() || null,
          capacity: capacity == null ? null : Math.trunc(capacity),
          visibility: "members",
          status: "published",
          created_by: user.id,
          season_id: activeSeason.id,
          kind: "social",
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as EventRow;
    },
    onSuccess: async (row) => {
      toast.success("Social created");
      setSocialCreateOpen(false);
      setSocialDraft((s) => ({ ...s, title: "", description: "" }));
      await queryClient.invalidateQueries({ queryKey: ["season-socials", activeSeason?.id] });
      navigate(`/events/${row.id}`);
    },
    onError: (e: any) => toast.error(e?.message || "Could not create social"),
  });

  const [socialRequestOpen, setSocialRequestOpen] = useState(false);
  const [socialRequestDraft, setSocialRequestDraft] = useState({
    title: "",
    description: "",
    preferredDate: format(new Date(), "yyyy-MM-dd"),
    preferredTime: "18:00",
  });

  const requestSocial = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not logged in");
      if (!activeSeason?.id) throw new Error("No active season");
      const title = socialRequestDraft.title.trim();
      if (!title) throw new Error("Please enter a title");
      const { error } = await (supabase as any)
        .from("event_requests")
        .insert({
          user_id: user.id,
          season_id: activeSeason.id,
          kind: "social",
          title,
          description: socialRequestDraft.description.trim() || null,
          preferred_date: socialRequestDraft.preferredDate || null,
          preferred_time: socialRequestDraft.preferredTime || null,
          visibility: "members",
        })
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request sent to admins");
      setSocialRequestOpen(false);
      setSocialRequestDraft((s) => ({ ...s, title: "", description: "" }));
    },
    onError: (e: any) => {
      if ((e as any)?.code === "42P01") {
        toast.error("Event requests are not enabled yet (database not updated).");
        return;
      }
      toast.error(e?.message || "Could not send request");
    },
  });

  const topPlayers = (user ? ladder?.slice(0, 5) : publicLeaderboard?.slice(0, 5)) || [];
  const spotlight = topPlayers.length > 0 ? topPlayers[0] : null;

  const slotsPerCourt = 32; // 06:00–22:00 in 30-min increments
  const bookedCourt1 = (todayBookings || []).filter((b: any) => b.court_id === 1).length;
  const bookedCourt2 = (todayBookings || []).filter((b: any) => b.court_id === 2).length;
  const openCourt1 = Math.max(0, slotsPerCourt - bookedCourt1);
  const openCourt2 = Math.max(0, slotsPerCourt - bookedCourt2);

  const getInitials = (name: string) =>
    name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  const myWinRate = me && me.matches_played > 0
    ? Math.round((me.wins / me.matches_played) * 100)
    : 0;

  const incomingPendingCount = user
    ? (myChallenges || []).filter((c) => c.status === "pending" && c.opponent_id === user.id).length
    : 0;

  const activeChallengesCount = (myChallenges || []).filter((c) => c.status === "pending" || c.status === "accepted").length;

  const canOpenAdmin = (myRoles || []).includes("admin") || (myRoles || []).includes("moderator");
  const seasonStartDate = activeSeason?.starts_on ? new Date(`${activeSeason.starts_on}T00:00:00`) : null;
  const isNewSeason = seasonStartDate ? Math.abs(differenceInCalendarDays(new Date(), seasonStartDate)) <= 7 : false;
  const seasonTheme = (() => {
    const name = (activeSeason?.name || "").toLowerCase();
    if (name.includes("autumn") || name.includes("fall")) {
      return {
        label: "Autumn",
        Icon: Leaf,
        cardClass: "border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-background",
        bannerClass: "bg-gradient-to-r from-amber-500/25 via-orange-500/15 to-background",
        glowClass: "bg-amber-500/20",
        iconClass: "text-amber-500/30",
      };
    }
    if (name.includes("winter")) {
      return {
        label: "Winter",
        Icon: Snowflake,
        cardClass: "border-sky-500/25 bg-gradient-to-br from-sky-500/15 via-indigo-500/10 to-background",
        bannerClass: "bg-gradient-to-r from-sky-500/20 via-indigo-500/12 to-background",
        glowClass: "bg-sky-500/18",
        iconClass: "text-sky-500/30",
      };
    }
    if (name.includes("spring")) {
      return {
        label: "Spring",
        Icon: Flower2,
        cardClass: "border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 via-pink-500/10 to-background",
        bannerClass: "bg-gradient-to-r from-emerald-500/18 via-pink-500/10 to-background",
        glowClass: "bg-emerald-500/16",
        iconClass: "text-emerald-500/30",
      };
    }
    if (name.includes("summer")) {
      return {
        label: "Summer",
        Icon: Sun,
        cardClass: "border-yellow-500/25 bg-gradient-to-br from-yellow-500/15 via-sky-500/10 to-background",
        bannerClass: "bg-gradient-to-r from-yellow-500/18 via-sky-500/10 to-background",
        glowClass: "bg-yellow-500/18",
        iconClass: "text-yellow-500/30",
      };
    }
    return {
      label: "Season",
      Icon: Trophy,
      cardClass: "border-primary/20 bg-primary/5",
      bannerClass: "bg-primary/5",
      glowClass: "bg-primary/10",
      iconClass: "text-primary/25",
    };
  })();

  const nextUp = upcomingGames[0] || null;
  const scrollToLeaderboard = () => {
    if (typeof document === "undefined") return;
    document.getElementById("leaderboard")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background bottom-nav-safe">
      <SEO
        path="/"
        description="Gordon's Bay Squash Club — book courts, challenge players, and climb the social league ladder."
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "SportsClub",
          "@id": `${absoluteUrl("/")}#sportsclub`,
          name: "Gordon's Bay Squash Club",
          url: absoluteUrl("/"),
          sport: "Squash",
          logo: absoluteUrl("/pwa-512x512.png"),
          image: absoluteUrl("/pwa-512x512.png"),
          address: {
            "@type": "PostalAddress",
            addressLocality: "Gordon's Bay",
            addressRegion: "Western Cape",
            addressCountry: "ZA",
          },
        }}
      />
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBg} alt="Squash court" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--court))]/90 via-[hsl(var(--court))]/70 to-background" />
        </div>

        <div className="relative z-10 w-full px-4 sm:px-6 lg:px-[5%] pt-12 pb-10">
          {/* Nav bar */}
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-2">
              <img src={clubLogo} alt="GB Squash" className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg" />
              <span className="font-heading font-bold text-sm text-primary-foreground">GB Squash</span>
            </div>
            {!user ? (
              <Button
                size="sm"
                variant="outline"
                className="border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
                onClick={() => navigate("/auth")}
              >
                <LogIn className="w-4 h-4 mr-1" /> Sign In
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <NotificationsDropdown
                  triggerVariant="outline"
                  triggerClassName="border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
                  onClick={() => navigate("/dashboard")}
                >
                  Dashboard
                </Button>
              </div>
            )}
          </div>

          {/* Hero content */}
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold text-primary-foreground leading-tight mb-3">
              Gordon's Bay<br />Squash Club
            </h1>
            <p className="text-primary-foreground/80 text-sm sm:text-base leading-relaxed mb-6 max-w-none w-[92%] sm:w-[70%] lg:w-[55%]">
              Book courts, challenge players, and track your performance — all in one place.
            </p>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            className="flex flex-col sm:flex-row gap-3"
            {...fadeUp}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold w-full sm:w-auto"
              onClick={() => navigate(user ? "/bookings" : "/auth")}
            >
              <Calendar className="w-4 h-4 mr-1.5" /> Book a Court
            </Button>
            <Button
              variant="outline"
              className="border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10 w-full sm:w-auto"
              onClick={() => (user ? navigate("/challenges/new") : scrollToLeaderboard())}
            >
              {user ? (
                <>
                  <Swords className="w-4 h-4 mr-1.5" /> Challenge a Player
                </>
              ) : (
                <>
                  <Trophy className="w-4 h-4 mr-1.5" /> View Leaderboard
                </>
              )}
            </Button>
          </motion.div>

          {/* Season prize (coupon style) */}
          {user && activeSeason ? (
            <motion.div
              className="mt-6 flex w-full"
              {...fadeUp}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <Card className="relative w-[300px] h-[200px] max-w-full overflow-hidden border-primary-foreground/20 bg-primary-foreground/10 backdrop-blur-md text-primary-foreground mx-auto sm:mx-0">
                <div className={["absolute inset-x-0 top-0 h-2", seasonTheme.bannerClass].join(" ")} />
                <CardContent className="p-4 pt-5 h-full flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="relative w-12 h-12 rounded-xl bg-primary-foreground/15 flex items-center justify-center shrink-0">
                        <Trophy className="w-6 h-6 text-primary-foreground" />
                        <seasonTheme.Icon className="w-4 h-4 absolute -bottom-1 -right-1 text-primary-foreground/80" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wide text-primary-foreground/70">Season prize</p>
                        <p className="text-sm font-semibold truncate">{activeSeason.name}</p>
                        <p className="text-[11px] text-primary-foreground/70 mt-1 truncate">
                          {activeSeason.ends_on ? `Ends ${activeSeason.ends_on}` : `Started ${activeSeason.starts_on}`}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] bg-accent/25 text-primary-foreground border border-primary-foreground/15 shrink-0">
                      In play
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-[11px] text-primary-foreground/70 flex items-center gap-2 min-w-0">
                      <Users className="w-3.5 h-3.5 shrink-0 text-primary-foreground/70" />
                      <span className="truncate">
                        {seasonMemberCountLoading ? "Loading joined…" : typeof seasonMemberCount === "number" ? `${seasonMemberCount} joined` : "—"}
                      </span>
                    </div>
                    {joinedActiveSeason ? (
                      <Badge variant="secondary" className="bg-primary-foreground/10 text-primary-foreground border border-primary-foreground/15 text-[10px] shrink-0">
                        Joined
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-auto flex items-center gap-2">
                    {!joinedActiveSeason ? (
                      <Button
                        size="sm"
                        className="h-8 text-xs bg-accent text-accent-foreground hover:bg-accent/90"
                        onClick={() => joinSeason.mutate()}
                        disabled={joinSeason.isPending}
                      >
                        {joinSeason.isPending ? "Joining…" : "Join"}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
                      onClick={() => navigate("/seasons")}
                    >
                      View season
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : null}

          {/* Live stats strip */}
          <motion.div
            className="flex flex-wrap gap-2 sm:gap-3 mt-8"
            {...fadeUp}
            transition={{ delay: 0.25, duration: 0.5 }}
          >
            {user ? (
              <>
                <div className="flex items-center gap-2 bg-primary-foreground/18 border border-primary-foreground/20 shadow-sm backdrop-blur-sm rounded-full px-3.5 py-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary-foreground/80" />
                  <span className="text-xs font-medium text-primary-foreground">
                    {openCourt1 + openCourt2} open slots today
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-primary-foreground/18 border border-primary-foreground/20 shadow-sm backdrop-blur-sm rounded-full px-3.5 py-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary-foreground/80" />
                  <span className="text-xs font-medium text-primary-foreground">
                    {nextUp
                      ? `Next up: ${nextUp.date} · ${nextUp.start_hhmm}`
                      : "No upcoming bookings"}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 bg-primary-foreground/18 border border-primary-foreground/20 shadow-sm backdrop-blur-sm rounded-full px-3.5 py-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-primary-foreground/80" />
                <span className="text-xs font-medium text-primary-foreground">
                  Public leaderboard live
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 bg-primary-foreground/18 border border-primary-foreground/20 shadow-sm backdrop-blur-sm rounded-full px-3.5 py-1.5">
              <Users className="w-3.5 h-3.5 text-primary-foreground/80" />
              <span className="text-xs font-medium text-primary-foreground">
                {user ? (ladder?.length || 0) : (publicLeaderboard?.length || 0)} players
              </span>
            </div>
            {user && incomingPendingCount > 0 ? (
              <div className="flex items-center gap-2 bg-primary-foreground/18 border border-primary-foreground/20 shadow-sm backdrop-blur-sm rounded-full px-3.5 py-1.5">
                <Swords className="w-3.5 h-3.5 text-primary-foreground/80" />
                <span className="text-xs font-medium text-primary-foreground">
                  {incomingPendingCount} challenge{incomingPendingCount === 1 ? "" : "s"} to respond
                </span>
              </div>
            ) : null}
            </motion.div>
        </div>
      </section>

      {/* Logged-in Overview */}
      {user && (
        <motion.section
          className="px-4 sm:px-6 lg:px-[5%] mt-6"
          {...fadeUp}
          transition={{ delay: 0.28 }}
        >
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-heading font-semibold text-base truncate">
                  Welcome back{me?.name ? `, ${me.name.split(" ")[0]}` : ""}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  What you need for today — at a glance.
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate("/profile", { state: { backgroundLocation: location } })}>
                <UserRound className="w-4 h-4 mr-1.5" /> Profile
              </Button>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold font-heading">Quick actions</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Jump straight to the important stuff.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button type="button" className="text-left" onClick={() => navigate("/challenges/new")}>
                  <Card className="h-full hover:shadow-md transition-all">
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className="mt-0.5 shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Swords className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">Challenge</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          Create a ladder match or friendly game.
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground mt-1" />
                    </CardContent>
                  </Card>
                </button>

                <button type="button" className="text-left" onClick={() => navigate("/ladder")}>
                  <Card className="h-full hover:shadow-md transition-all">
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className="mt-0.5 shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Trophy className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">Ladder</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          See rankings and player stats.
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground mt-1" />
                    </CardContent>
                  </Card>
                </button>

                <button
                  type="button"
                  className="text-left"
                  onClick={() => navigate(canOpenAdmin ? "/admin" : "/events")}
                >
                  <Card className="h-full hover:shadow-md transition-all">
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className="mt-0.5 shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        {canOpenAdmin ? (
                          <Shield className="w-5 h-5 text-primary" />
                        ) : (
                          <Calendar className="w-5 h-5 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{canOpenAdmin ? "Admin" : "Events"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {canOpenAdmin ? "Manage club settings and tools." : "See socials and club events."}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground mt-1" />
                    </CardContent>
                  </Card>
                </button>
              </div>
            </div>

            {activeSeason && (seasonSocials || []).length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold font-heading">Season socials</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Small club meetups created by members</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => navigate("/events")}>
                      See all <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {(seasonSocials || []).slice(0, 3).map((e) => {
                      const starts = new Date(e.starts_at);
                      const ends = e.ends_at ? new Date(e.ends_at) : null;
                      const myStatus = mySocialRsvps?.get(e.id) || null;
                      return (
                        <div key={e.id} className="rounded-lg border border-border p-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{e.title}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {format(starts, "EEE, d MMM · HH:mm")}
                              {ends ? ` – ${format(ends, "HH:mm")}` : ""}
                              {e.location ? ` · ${e.location}` : ""}
                            </p>
                            {e.description ? (
                              <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2 whitespace-pre-line">
                                {e.description}
                              </p>
                            ) : null}
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-2">
                            {myStatus ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {myStatus === "going" ? "Going" : myStatus === "maybe" ? "Maybe" : "Not going"}
                              </Badge>
                            ) : null}
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate(`/events/${e.id}`)}>
                                Details
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 text-xs"
                                disabled={!joinedActiveSeason || rsvpGoing.isPending}
                                onClick={() => rsvpGoing.mutate(e.id)}
                              >
                                {joinedActiveSeason ? "Join" : "Join season"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            <div>
              <AppleStatsCard
                title="Your stats"
                subtitle="At-a-glance performance."
                badgeText={typeof me?.rank === "number" ? `Rank #${me.rank}` : "Unranked"}
                rightHeader={
                  incomingPendingCount > 0 ? (
                    <Badge variant="secondary" className="text-[10px] bg-primary/15 text-primary">
                      {incomingPendingCount} new
                    </Badge>
                  ) : null
                }
                ringLabel="Win rate"
                ringValue={`${myWinRate}%`}
                progress={{
                  played: Math.min(1, (me?.matches_played ?? 0) / 50),
                  wins: Math.min(1, (me?.wins ?? 0) / 25),
                  winPct: Math.min(1, myWinRate / 100),
                }}
                tiles={[
                  { label: "Played", value: me?.matches_played ?? 0, unit: "matches", dotColor: "#007aff" },
                  { label: "Wins", value: me?.wins ?? 0, unit: "wins", dotColor: "#34c759" },
                  { label: "Losses", value: me?.losses ?? 0, unit: "losses", dotColor: "#ff9500" },
                  { label: "Challenges", value: activeChallengesCount, unit: "active", dotColor: "#af52de" },
                ]}
                footer={
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" className="h-9" onClick={() => navigate("/ladder")}>
                      <Trophy className="w-4 h-4 mr-2" />
                      Ladder
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9"
                      onClick={() => navigate("/profile?edit=1", { state: { backgroundLocation: location } })}
                    >
                      Profile
                    </Button>
                    <Button size="sm" variant="outline" className="h-9" onClick={() => navigate("/challenges")}>
                      <Swords className="w-4 h-4 mr-2" />
                      Challenges
                    </Button>
                  </div>
                }
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold font-heading">Upcoming bookings</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Your next scheduled sessions.</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate("/bookings")}>
                    View
                  </Button>
                </div>

                {upcomingGames.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-3">No upcoming bookings yet.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {upcomingGames.slice(0, 3).map((g: any) => (
                      <div key={g.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {g.opponent_name ? `vs ${g.opponent_name}` : "Solo booking"}
                              {typeof g.opponent_rank === "number" ? (
                                <span className="text-xs text-muted-foreground"> · #{g.opponent_rank}</span>
                              ) : null}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {g.date} · {g.court_name} · {g.start_hhmm}–{g.end_hhmm}
                            </p>
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1">
                            <Badge variant="secondary" className="text-[10px]">
                              {g.is_friendly ? "Friendly" : g.challenge_id ? "Ladder" : "Game"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                    {upcomingGames.length > 3 ? (
                      <p className="text-xs text-muted-foreground">+{upcomingGames.length - 3} more</p>
                    ) : null}
                  </div>
                )}
              </Card>

              <Card className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold font-heading">Recent results</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Past games with scores.</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate("/challenges")}>
                    View
                  </Button>
                </div>

                {recentGamesWithResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-3">No results yet.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {recentGamesWithResults.map((m: any) => {
                      const icon =
                        m.is_win === true ? <ArrowUp className="w-3.5 h-3.5 text-accent-foreground" /> :
                        m.is_win === false ? <ArrowDown className="w-3.5 h-3.5 text-destructive" /> :
                        <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
                      return (
                        <div key={m.id} className="rounded-lg border border-border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">vs {m.opponent_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {m.match_date} · Court {m.court_id || "—"}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {icon}
                                <p className="text-sm font-semibold tabular-nums">{m.score || "—"}</p>
                              </div>
                              <div className="mt-1 flex items-center justify-end gap-1">
                                {m.confirmed ? (
                                  <Badge variant="secondary" className="text-[10px] bg-accent/20 text-accent-foreground border-0">
                                    Confirmed
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground border-0">
                                    Unconfirmed
                                  </Badge>
                                )}
                                {m.disputed ? (
                                  <Badge variant="secondary" className="text-[10px] bg-destructive/10 text-destructive border-0">
                                    Disputed
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </motion.section>
      )}

      {/* Create social dialog */}
      <Dialog open={socialCreateOpen} onOpenChange={setSocialCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create a season social</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={socialDraft.title} onChange={(e) => setSocialDraft((s) => ({ ...s, title: e.target.value }))} placeholder="e.g. Friday evening social" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={socialDraft.description} onChange={(e) => setSocialDraft((s) => ({ ...s, description: e.target.value }))} placeholder="Optional details…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={socialDraft.date} onChange={(e) => setSocialDraft((s) => ({ ...s, date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Capacity</Label>
                <Input value={socialDraft.capacity} onChange={(e) => setSocialDraft((s) => ({ ...s, capacity: e.target.value }))} placeholder="Optional" inputMode="numeric" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input type="time" value={socialDraft.startTime} onChange={(e) => setSocialDraft((s) => ({ ...s, startTime: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>End</Label>
                <Input type="time" value={socialDraft.endTime} onChange={(e) => setSocialDraft((s) => ({ ...s, endTime: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input value={socialDraft.location} onChange={(e) => setSocialDraft((s) => ({ ...s, location: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSocialCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createSocial.mutate()} disabled={createSocial.isPending}>
              {createSocial.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request social dialog */}
      <Dialog open={socialRequestOpen} onOpenChange={setSocialRequestOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request a season social</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Card className="p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">
                Your request goes to the club admins. If approved, they’ll publish it as an official event you can RSVP to.
              </p>
            </Card>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={socialRequestDraft.title} onChange={(e) => setSocialRequestDraft((s) => ({ ...s, title: e.target.value }))} placeholder="e.g. Autumn braai + friendly games" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={socialRequestDraft.description} onChange={(e) => setSocialRequestDraft((s) => ({ ...s, description: e.target.value }))} placeholder="Optional details…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Preferred date</Label>
                <Input type="date" value={socialRequestDraft.preferredDate} onChange={(e) => setSocialRequestDraft((s) => ({ ...s, preferredDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Preferred time</Label>
                <Input type="time" value={socialRequestDraft.preferredTime} onChange={(e) => setSocialRequestDraft((s) => ({ ...s, preferredTime: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSocialRequestOpen(false)}>Cancel</Button>
            <Button onClick={() => requestSocial.mutate()} disabled={requestSocial.isPending}>
              {requestSocial.isPending ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Club Insights */}
      {user && (
        <motion.section
          className="px-4 sm:px-6 lg:px-[5%] mt-10"
          {...fadeUp}
          transition={{ delay: 0.32 }}
        >
          <div className="flex items-end justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h2 className="font-heading font-semibold text-base">Club Insights</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {insights?.range ? `Last ${insights.range.days} days` : "Loading…"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sessions</p>
                <p className="font-heading font-bold text-lg mt-1">{insights?.totals?.sessions ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Bookings played</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg session</p>
                <p className="font-heading font-bold text-lg mt-1">
                  {typeof insights?.totals?.avg_session_minutes === "number" ? `${insights.totals.avg_session_minutes}m` : "—"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">Based on bookings</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Busiest day</p>
                <p className="font-heading font-bold text-lg mt-1">{insights?.busiest?.day ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {typeof insights?.busiest?.day_count === "number" ? `${insights.busiest.day_count} sessions` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Busiest time</p>
                <p className="font-heading font-bold text-lg mt-1">{insights?.busiest?.slot ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {typeof insights?.busiest?.slot_count === "number" ? `${insights.busiest.slot_count} bookings` : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-3 overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">When the courts are busiest</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Bookings per 30-min slot (both courts combined)
                  </p>
                </div>
                {insights?.busiest?.slot ? (
                  <Badge variant="secondary" className="shrink-0">
                    Peak: {insights.busiest.slot}
                  </Badge>
                ) : null}
              </div>

              {busyness && busyness.length > 0 ? (
                <div className="mt-4">
                  <div className="flex items-end gap-1 overflow-x-auto pb-2">
                    {(() => {
                      const max = Math.max(...busyness.map((b) => Number(b.bookings_count || 0)), 1);
                      return busyness.map((b) => {
                        const c = Number(b.bookings_count || 0);
                        const h = Math.max(2, Math.round((c / max) * 64));
                        const isPeak = insights?.busiest?.slot && b.slot === insights.busiest.slot;
                        return (
                          <div key={b.slot} className="shrink-0 flex flex-col items-center gap-1">
                            <div
                              title={`${b.slot} — ${c} bookings`}
                              className={`w-3 rounded-sm ${isPeak ? "bg-accent" : c > 0 ? "bg-primary/60" : "bg-muted"}`}
                              style={{ height: `${h}px` }}
                            />
                            <span className="text-[9px] text-muted-foreground">
                              {b.slot.endsWith(":00") ? b.slot.slice(0, 2) : ""}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Tip: tap/hover a bar to see the slot and count.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-4">No data yet.</p>
              )}
            </CardContent>
          </Card>

          {(insights?.top_players?.length || 0) > 0 && (
            <Card className="mt-3">
              <CardContent className="p-4">
                <p className="text-sm font-semibold">Most active players</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Players with the most sessions in the last {insights?.range?.days ?? 30} days
                </p>
                <div className="mt-3 space-y-2">
                  {insights!.top_players.slice(0, 5).map((p, idx) => (
                    <div key={p.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground w-5 text-right">{idx + 1}</span>
                        <span className="text-sm font-medium truncate">{p.name}</span>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {p.sessions}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </motion.section>
      )}

      {/* Public view: hide shortcuts until logged in */}

      {/* Ladder Rankings */}
      <motion.section
        id="leaderboard"
        className="px-4 sm:px-6 lg:px-[5%] mt-10"
        {...fadeUp}
        transition={{ delay: 0.35 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-semibold text-base">{user ? "Ladder Rankings" : "Leaderboard"}</h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 text-primary"
            onClick={() => navigate(user ? "/ladder" : "/auth")}
          >
            {user ? "View Full Ladder" : "Sign in for full ladder"} <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {topPlayers.length > 0 ? (
              <div className="divide-y divide-border">
                {topPlayers.map((player, i) => {
                  const winPct = player.matches_played > 0
                    ? Math.round((player.wins / player.matches_played) * 100)
                    : 0;
                  return (
                    <div key={player.id} className="flex items-center gap-3 px-4 py-3">
                      <span className={`w-7 text-center font-heading font-bold text-sm ${i < 3 ? "text-primary" : "text-muted-foreground"}`}>
                        {i < 3 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10">
                            {player.rank}
                          </span>
                        ) : player.rank}
                      </span>
                      <PlayerAvatar initials={getInitials(player.name)} size="sm" avatarUrl={(player as any)?.avatar_url || null} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{player.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {player.matches_played}M · {player.wins}W · {winPct}%
                        </p>
                      </div>
                      {i < 3 && (
                        <Badge variant="secondary" className="text-[10px] font-semibold">
                          <Star className="w-3 h-3 mr-0.5" /> Top 3
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No ranked players yet.
              </div>
            )}
          </CardContent>
        </Card>

      </motion.section>

      {/* Court Availability */}
      {user && (
        <motion.section
          className="px-4 sm:px-6 lg:px-[5%] mt-10"
          {...fadeUp}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading font-semibold text-base">Today's Courts</h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 text-primary"
              onClick={() => navigate("/bookings")}
            >
              Book Now <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[1, 2].map((courtId) => {
              const courtBookings = todayBookings?.filter(b => b.court_id === courtId) || [];
              return (
                <Card key={courtId} className="overflow-hidden">
                  <div className="h-2 bg-primary" />
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-heading font-bold text-sm">Court {courtId}</span>
                      <Badge
                        variant={courtBookings.length < 28 ? "secondary" : "destructive"}
                        className="text-[10px]"
                      >
                        {Math.max(0, 32 - courtBookings.length)} open
                      </Badge>
                    </div>
                    {courtBookings.length > 0 ? (
                      <div className="space-y-1.5">
                        {courtBookings.slice(0, 3).map((b) => (
                          <div key={b.id} className="flex items-center gap-2 text-xs">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              {b.start_time?.slice(0, 5)} — {b.player_name}
                              {b.opponent_name ? ` vs ${b.opponent_name}` : ""}
                            </span>
                          </div>
                        ))}
                        {courtBookings.length > 3 && (
                          <p className="text-[10px] text-muted-foreground">
                            +{courtBookings.length - 3} more
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">All slots available</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* Player Spotlight */}
      {spotlight && (
        <motion.section
          className="px-4 sm:px-6 lg:px-[5%] mt-10"
          {...fadeUp}
          transition={{ delay: 0.45 }}
        >
          <h2 className="font-heading font-semibold text-base mb-3">Player Spotlight</h2>
          <Card className="overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-primary to-accent" />
            <CardContent className="p-5 flex items-center gap-4">
              <PlayerAvatar
                initials={getInitials(spotlight.name)}
                rank={spotlight.rank}
                size="lg"
                avatarUrl={(spotlight as any)?.avatar_url || null}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Star className="w-4 h-4 text-accent" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-foreground">
                    Top Ranked Player
                  </span>
                </div>
                <p className="font-heading font-bold text-lg">{spotlight.name}</p>
                <div className="flex gap-3 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {spotlight.wins}W – {spotlight.losses}L
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Rank #{spotlight.rank}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.section>
      )}

      {/* Join CTA for unauthenticated */}
      {!user && (
        <motion.section
          className="px-4 sm:px-6 lg:px-[5%] mt-10 mb-8"
          {...fadeUp}
          transition={{ delay: 0.5 }}
        >
          <Card className="bg-primary text-primary-foreground overflow-hidden">
            <CardContent className="p-6 text-center">
              <h3 className="font-heading font-bold text-xl mb-2">Join the Club</h3>
              <p className="text-sm text-primary-foreground/80 mb-5">
                Sign up to book courts, challenge players, and climb the ladder.
              </p>
              <Button
                className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold"
                onClick={() => navigate("/auth")}
              >
                Get Started — It's Free
              </Button>
            </CardContent>
          </Card>
        </motion.section>
      )}

    </div>
  );
}
