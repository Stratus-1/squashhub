import { ThemeToggle } from "@/components/ThemeToggle";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { IntegrationLogo } from "@/components/IntegrationLogo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Trophy, Target, TrendingUp, Settings, LogOut, Loader2, Bell, Shield,
  Swords, Award, Flame, ChevronRight, Calendar, MapPin, Hand, Zap, Mail
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { HeadToHeadRow, useHeadToHead, useIntegrations, useMyRoles, useProfile, useSquashTotals } from "@/hooks/use-data";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Link } from "react-router-dom";

type StravaActivityPreview = {
  id: number;
  name: string;
  type: string;
  sport_type: string | null;
  start_date: string;
  start_date_local: string | null;
  distance: number;
  moving_time: number;
  elapsed_time: number | null;
  total_elevation_gain: number;
};

type EditableProfileFields = {
  name: string;
  phone: string;
  bio: string;
  location: string;
  home_club: string;
  dominant_hand: "" | "right" | "left" | "ambidextrous";
  years_playing: string;
  playing_style: string;
  favorite_shot: string;
  court_checkins_enabled: boolean;
  privacy_show_about: boolean;
  privacy_show_availability: boolean;
  privacy_show_recent_matches: boolean;
  privacy_show_training: boolean;
  privacy_show_advanced_stats: boolean;
};

type AvailabilityBlock = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

const dayOptions: Array<{ value: number; label: string }> = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

/* ─── Win Rate Ring ─── */
function WinRateRing({ rate, size = 80 }: { rate: number; size?: number }) {
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (rate / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="hsl(var(--primary))" strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold font-heading leading-none">{rate}%</span>
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Win</span>
      </div>
    </div>
  );
}

/* ─── Coming Soon Card ─── */
function ComingSoonAppCard({
  provider, title, subtitle, learnMoreText, className,
}: {
  provider: "apple_health" | "samsung_health" | "huawei_health" | "garmin";
  title: string; subtitle: string; learnMoreText: string; className?: string;
}) {
  return (
    <div className={["rounded-lg border border-border bg-card p-4 flex items-center gap-3", className || ""].join(" ")}>
      <IntegrationLogo provider={provider} className="opacity-40 grayscale shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      <Badge variant="secondary" className="bg-muted text-muted-foreground shrink-0 text-[10px]">Soon</Badge>
    </div>
  );
}

export default function Profile() {
  const { signOut, user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const { data: integrations } = useIntegrations();
  const { data: myRoles } = useMyRoles();
  const { permission, isSubscribed, loading: pushLoading, subscribe, unsubscribe } = usePushNotifications();
  const { data: squashTotals, isLoading: squashTotalsLoading } = useSquashTotals(user?.id);
  const { data: headToHead, isLoading: headToHeadLoading } = useHeadToHead(user?.id, 10);
  const queryClient = useQueryClient();
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [stravaRecentLoading, setStravaRecentLoading] = useState(false);
  const [stravaRecent, setStravaRecent] = useState<StravaActivityPreview[] | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [edit, setEdit] = useState<EditableProfileFields>({
    name: "", phone: "", bio: "", location: "", home_club: "",
    dominant_hand: "", years_playing: "", playing_style: "", favorite_shot: "",
    court_checkins_enabled: false,
    privacy_show_about: true, privacy_show_availability: true,
    privacy_show_recent_matches: true, privacy_show_training: true, privacy_show_advanced_stats: true,
  });
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<AvailabilityBlock[]>([]);
  const didHydrateEditRef = useRef(false);
  const didLoadAvailabilityRef = useRef(false);
  const [emailPrefsAvailable, setEmailPrefsAvailable] = useState(true);
  const [emailPrefsLoading, setEmailPrefsLoading] = useState(false);
  const [emailPrefs, setEmailPrefs] = useState<{
    transactional_email_enabled: boolean;
    marketing_email_enabled: boolean;
    email_fallback_only: boolean;
  }>({
    transactional_email_enabled: true,
    marketing_email_enabled: false,
    email_fallback_only: true,
  });

  const strava = useMemo(() => integrations?.find((i) => i.provider === "strava") || null, [integrations]);

  const publicWebBaseUrl = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim()?.replace(/\/+$/, "");
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()?.replace(/\/+$/, "");
  const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();
  const supabaseProjectRef = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined)?.trim();
  const supabaseHostRef = (() => {
    if (!supabaseUrl) return null;
    try {
      const host = new URL(supabaseUrl).hostname;
      return host.split(".")[0] || host;
    } catch {
      return null;
    }
  })();

  const rivals = useMemo(() => {
    const rows = (headToHead || []) as HeadToHeadRow[];
    return rows
      .filter((r) => r.matches >= 2)
      .sort((a, b) => b.matches !== a.matches ? b.matches - a.matches : Math.abs(a.win_rate - 50) - Math.abs(b.win_rate - 50))
      .slice(0, 3);
  }, [headToHead]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`realtime:profiles:${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
        queryClient.invalidateQueries({ queryKey: ["ladder"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setEmailPrefsLoading(true);
    (supabase as any)
      .from("notification_preferences")
      .select("transactional_email_enabled,marketing_email_enabled,email_fallback_only")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }: any) => {
        if (cancelled) return;
        if (error) {
          if (error.code === "42P01") {
            setEmailPrefsAvailable(false);
            return;
          }
          if (error.code === "PGRST116") return; // no row
          throw error;
        }
        if (!data) return;
        setEmailPrefs({
          transactional_email_enabled: data.transactional_email_enabled ?? true,
          marketing_email_enabled: data.marketing_email_enabled ?? false,
          email_fallback_only: data.email_fallback_only ?? true,
        });
      })
      .catch((e: any) => {
        if (cancelled) return;
        toast.error(e?.message || "Failed to load email preferences");
      })
      .finally(() => {
        if (cancelled) return;
        setEmailPrefsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const saveEmailPrefs = useMutation({
    mutationFn: async (next: {
      transactional_email_enabled: boolean;
      marketing_email_enabled: boolean;
      email_fallback_only: boolean;
    }) => {
      if (!user?.id) throw new Error("Not signed in");
      const { error } = await (supabase as any)
        .from("notification_preferences")
        .upsert({ user_id: user.id, ...next }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Email preferences updated"),
    onError: (e: any) => toast.error(e?.message || "Failed to update email preferences"),
  });

  useEffect(() => {
    if (!editOpen) {
      didHydrateEditRef.current = false;
      didLoadAvailabilityRef.current = false;
      return;
    }

    if (!didHydrateEditRef.current && profile) {
      didHydrateEditRef.current = true;
      setEdit({
        name: profile.name || "",
        phone: (profile.phone as any) || "",
        bio: (profile as any).bio || "",
        location: (profile as any).location || "",
        home_club: (profile as any).home_club || "",
        dominant_hand: ((profile as any).dominant_hand as EditableProfileFields["dominant_hand"]) || "",
        years_playing: (profile as any).years_playing != null ? String((profile as any).years_playing) : "",
        playing_style: (profile as any).playing_style || "",
        favorite_shot: (profile as any).favorite_shot || "",
        court_checkins_enabled: (profile as any).court_checkins_enabled ?? false,
        privacy_show_about: (profile as any).privacy_show_about ?? true,
        privacy_show_availability: (profile as any).privacy_show_availability ?? true,
        privacy_show_recent_matches: (profile as any).privacy_show_recent_matches ?? true,
        privacy_show_training: (profile as any).privacy_show_training ?? true,
        privacy_show_advanced_stats: (profile as any).privacy_show_advanced_stats ?? true,
      });
    }

    if (!didLoadAvailabilityRef.current && user?.id) {
      didLoadAvailabilityRef.current = true;
      let cancelled = false;
      setAvailabilityLoading(true);
      (supabase as any)
        .from("player_availability")
        .select("day_of_week,start_time,end_time")
        .eq("user_id", user.id)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true })
        .then(({ data, error }: any) => {
          if (cancelled) return;
          if (error) throw error;
          setAvailabilityBlocks((data || []).map((b: any) => ({
            day_of_week: Number(b.day_of_week),
            start_time: String(b.start_time || "").slice(0, 5),
            end_time: String(b.end_time || "").slice(0, 5),
          })));
        })
        .catch((e: any) => {
          if (cancelled) return;
          toast.error(e.message || "Failed to load availability");
        })
        .finally(() => {
          if (cancelled) return;
          setAvailabilityLoading(false);
        });
      return () => { cancelled = true; };
    }
  }, [editOpen, profile, user?.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const winRate = profile && profile.matches_played > 0 ? Math.round((profile.wins / profile.matches_played) * 100) : 0;
  const phoneMissing = !profile?.phone || String(profile.phone).trim().length === 0;
  const initials = profile?.name ? profile.name.split(" ").map((n: string) => n[0]).join("").toUpperCase() : "?";
  const canOpenAdmin = (myRoles || []).includes("admin") || (myRoles || []).includes("moderator");

  // Strava derived
  const stravaDistanceM = (profile as any)?.strava_distance_m != null ? Number((profile as any).strava_distance_m) : null;
  const stravaMovingTimeS = (profile as any)?.strava_moving_time_s != null ? Number((profile as any).strava_moving_time_s) : null;
  const stravaKm = stravaDistanceM != null ? Math.round((stravaDistanceM / 1000) * 10) / 10 : null;
  const stravaMinutes = stravaMovingTimeS != null ? Math.round(stravaMovingTimeS / 60) : null;
  const stravaElevationRaw = (profile as any)?.strava_elevation_m != null ? Number((profile as any).strava_elevation_m) : null;
  const stravaElevationM = stravaElevationRaw != null ? Math.round(stravaElevationRaw * 10) / 10 : null;
  const stravaActivitiesCount = typeof (profile as any)?.strava_activities_count === "number" ? ((profile as any).strava_activities_count as number) : null;
  const stravaLastSync = (profile as any)?.strava_last_sync_at ? new Date((profile as any).strava_last_sync_at as string) : null;

  /* ─── Strava helpers ─── */
  const getStravaAuth = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("You must be logged in");
    if (!supabaseUrl || !supabaseKey) throw new Error("Missing configuration");
    return { accessToken, supabaseUrl, supabaseKey };
  };

  const stravaFetch = async (action: string) => {
    const { accessToken, supabaseUrl: url, supabaseKey: key } = await getStravaAuth();
    const res = await fetch(`${url}/functions/v1/strava`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ action }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.error || `${action} failed`);
    return payload;
  };

  return (
    <div className="bottom-nav-safe pb-8">
      {/* ─── Hero Profile Header ─── */}
      <motion.div
        className="relative bg-gradient-to-b from-primary/15 via-primary/5 to-transparent pt-8 pb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Theme Toggle */}
        <div className="absolute top-3 right-3">
          <ThemeToggle />
        </div>
        <div className="flex flex-col items-center px-4">
          <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}>
            <PlayerAvatar initials={initials} rank={profile?.rank} size="lg" />
          </motion.div>
          <h1 className="text-xl font-bold font-heading mt-3 tracking-tight">{profile?.name || "New Player"}</h1>
          <p className="text-sm text-muted-foreground">{profile?.email}</p>

          {/* Quick info badges */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
            {profile?.rank && (
              <Badge className="bg-primary/15 text-primary border-primary/20 gap-1">
                <Trophy className="w-3 h-3" /> Rank #{profile.rank}
              </Badge>
            )}
            {(profile as any)?.playing_style && (
              <Badge variant="secondary" className="gap-1">
                <Zap className="w-3 h-3" /> {(profile as any).playing_style}
              </Badge>
            )}
            {(profile as any)?.dominant_hand && (
              <Badge variant="secondary" className="gap-1">
                <Hand className="w-3 h-3" /> {(profile as any).dominant_hand}
              </Badge>
            )}
            {(profile as any)?.location && (
              <Badge variant="secondary" className="gap-1">
                <MapPin className="w-3 h-3" /> {(profile as any).location}
              </Badge>
            )}
          </div>

          {/* Core Stats Row */}
          <div className="flex items-center gap-6 mt-5">
            <div className="text-center">
              <p className="text-2xl font-bold font-heading">{profile?.matches_played || 0}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Played</p>
            </div>
            <WinRateRing rate={winRate} />
            <div className="text-center">
              <p className="text-2xl font-bold font-heading text-win">{profile?.wins || 0}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Wins</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ─── Complete Profile CTA ─── */}
      {phoneMissing && (
        <div className="px-4 -mt-2 mb-3">
          <Card className="border-accent/40 bg-accent/5">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold font-heading">Complete your profile</p>
                <p className="text-xs text-muted-foreground">Add your cell number so the club can reach you.</p>
              </div>
              <Button size="sm" className="shrink-0" onClick={() => setEditOpen(true)}>Add</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Tabbed Content ─── */}
      <div className="px-4 mt-2">
        <Tabs defaultValue="stats" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="stats" className="text-xs gap-1"><Target className="w-3.5 h-3.5" /> Stats</TabsTrigger>
            <TabsTrigger value="rivals" className="text-xs gap-1"><Swords className="w-3.5 h-3.5" /> Rivals</TabsTrigger>
            <TabsTrigger value="training" className="text-xs gap-1"><Flame className="w-3.5 h-3.5" /> Training</TabsTrigger>
          </TabsList>

          {/* ── Stats Tab ── */}
          <TabsContent value="stats" className="space-y-3 mt-3">
            {squashTotalsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : squashTotals && squashTotals.matches > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Card className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Current Streak</p>
                    <p className="text-lg font-bold font-heading mt-1">{squashTotals.current_streak || "—"}</p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Duration</p>
                    <p className="text-lg font-bold font-heading mt-1">{squashTotals.avg_duration_min != null ? `${squashTotals.avg_duration_min}m` : "—"}</p>
                  </Card>
                </div>

                <Card className="p-4">
                  <p className="text-xs font-semibold font-heading mb-3">Sets & Points</p>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Sets won</span>
                        <span className="font-medium tabular-nums">{squashTotals.sets_for} / {squashTotals.sets_for + squashTotals.sets_against}</span>
                      </div>
                      <Progress value={squashTotals.sets_for + squashTotals.sets_against > 0 ? (squashTotals.sets_for / (squashTotals.sets_for + squashTotals.sets_against)) * 100 : 0} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Points won</span>
                        <span className="font-medium tabular-nums">{squashTotals.points_for} / {squashTotals.points_for + squashTotals.points_against}</span>
                      </div>
                      <Progress value={squashTotals.points_for + squashTotals.points_against > 0 ? (squashTotals.points_for / (squashTotals.points_for + squashTotals.points_against)) * 100 : 0} className="h-2" />
                    </div>
                  </div>
                  <div className="flex gap-4 mt-3 text-[11px] text-muted-foreground">
                    <span>Best win streak: <span className="text-foreground font-medium">W{squashTotals.best_win_streak}</span></span>
                    <span>Best loss streak: <span className="text-foreground font-medium">L{squashTotals.best_loss_streak}</span></span>
                  </div>
                  {squashTotals.last_match_date && (
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Last match: {squashTotals.last_match_date}
                    </p>
                  )}
                </Card>
              </>
            ) : (
              <Card className="p-6 text-center">
                <Award className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground mt-2">No competitive matches yet.</p>
                <p className="text-xs text-muted-foreground">Challenge someone to start building your stats!</p>
              </Card>
            )}
          </TabsContent>

          {/* ── Rivals Tab ── */}
          <TabsContent value="rivals" className="space-y-3 mt-3">
            {headToHeadLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : rivals.length > 0 ? (
              <>
                {/* Top rivals */}
                {rivals.map((r, idx) => (
                  <Card key={r.opponent_id} className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{r.opponent_name}</p>
                        <p className="text-xs text-muted-foreground">{r.matches} matches</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums">
                          <span className="text-win">{r.wins}W</span>
                          <span className="text-muted-foreground mx-1">–</span>
                          <span className="text-loss">{r.losses}L</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">{r.win_rate}% win rate</p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <Progress value={r.win_rate} className="h-1.5" />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                      <span>Sets: {r.sets_for}–{r.sets_against}</span>
                      <span>Pts: {r.points_for}–{r.points_against}</span>
                      {r.last_match_date && <span>Last: {r.last_match_date}</span>}
                    </div>
                  </Card>
                ))}

                {/* Full H2H list */}
                {(headToHead || []).length > 3 && (
                  <Card className="p-4">
                    <p className="text-xs font-semibold font-heading mb-2">All opponents</p>
                    <div className="space-y-2">
                      {(headToHead || []).filter(r => !rivals.find(rv => rv.opponent_id === r.opponent_id)).slice(0, 5).map((r) => (
                        <div key={r.opponent_id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                          <span className="text-sm truncate">{r.opponent_name}</span>
                          <span className="text-xs tabular-nums text-muted-foreground">{r.wins}W–{r.losses}L ({r.win_rate}%)</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            ) : (
              <Card className="p-6 text-center">
                <Swords className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground mt-2">No rivals yet.</p>
                <p className="text-xs text-muted-foreground">Play 2+ matches against someone to see them here.</p>
              </Card>
            )}
          </TabsContent>

          {/* ── Training Tab ── */}
          <TabsContent value="training" className="space-y-3 mt-3">
            {strava ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Card className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Distance</p>
                    <p className="text-lg font-bold font-heading mt-1">{stravaKm != null ? `${stravaKm} km` : "—"}</p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Time</p>
                    <p className="text-lg font-bold font-heading mt-1">{stravaMinutes != null ? `${stravaMinutes} min` : "—"}</p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Elevation</p>
                    <p className="text-lg font-bold font-heading mt-1">{stravaElevationM != null ? `${stravaElevationM} m` : "—"}</p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Activities</p>
                    <p className="text-lg font-bold font-heading mt-1">{stravaActivitiesCount ?? "—"}</p>
                  </Card>
                </div>
                {stravaLastSync && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Last synced: {stravaLastSync.toLocaleString()}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" disabled={stravaSyncing} onClick={async () => {
                    try {
                      setStravaSyncing(true);
                      const payload = await stravaFetch("sync");
                      if (!payload?.totals) throw new Error("Sync failed");
                      const km = Math.round((payload.totals.distance_m / 1000) * 10) / 10;
                      toast.success(`Synced: ${km} km`);
                      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
                      queryClient.invalidateQueries({ queryKey: ["integrations"] });
                    } catch (e: any) { toast.error(e.message); } finally { setStravaSyncing(false); }
                  }}>
                    {stravaSyncing ? "Syncing…" : "Sync Strava"}
                  </Button>
                  <Button variant="outline" size="sm" disabled={stravaRecentLoading} onClick={async () => {
                    try {
                      setStravaRecentLoading(true);
                      const payload = await stravaFetch("recent");
                      setStravaRecent((payload.activities || []) as StravaActivityPreview[]);
                    } catch (e: any) { toast.error(e.message); } finally { setStravaRecentLoading(false); }
                  }}>
                    {stravaRecentLoading ? "Loading…" : "Recent"}
                  </Button>
                </div>
                {stravaRecent && stravaRecent.length > 0 && (
                  <div className="space-y-2">
                    {stravaRecent.slice(0, 5).map((a) => (
                      <Card key={a.id} className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{a.name}</p>
                            <p className="text-[11px] text-muted-foreground">{new Date(a.start_date).toLocaleDateString()} · {a.sport_type || a.type}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold tabular-nums">{Math.round((a.distance / 1000) * 10) / 10} km</p>
                            <p className="text-[11px] text-muted-foreground tabular-nums">{Math.round(a.moving_time / 60)} min</p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Card className="p-6 text-center">
                <IntegrationLogo provider="strava" className="opacity-40 grayscale mx-auto" />
                <p className="text-sm text-muted-foreground mt-3">Connect Strava to track training.</p>
                <Button size="sm" className="mt-3" onClick={async () => {
                  const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
                  if (!clientId) { toast.error("Missing Strava config"); return; }
                  const state = crypto.randomUUID();
                  sessionStorage.setItem("strava_oauth_state", state);
                  const webBase = publicWebBaseUrl || window.location.origin;
                  const redirectUri = Capacitor.isNativePlatform()
                    ? "gbsquash://integrations/strava/callback"
                    : `${webBase}/integrations/strava/callback`;
                  const url = new URL("https://www.strava.com/oauth/authorize");
                  url.searchParams.set("client_id", clientId);
                  url.searchParams.set("redirect_uri", redirectUri);
                  url.searchParams.set("response_type", "code");
                  url.searchParams.set("approval_prompt", "auto");
                  url.searchParams.set("scope", "read,activity:read");
                  url.searchParams.set("state", state);
                  if (Capacitor.isNativePlatform()) {
                    const { Browser } = await import("@capacitor/browser");
                    await Browser.open({ url: url.toString() });
                    return;
                  }
                  window.location.assign(url.toString());
                }}>
                  Connect Strava
                </Button>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Settings Section ─── */}
      <Separator className="my-5 mx-4" />

      <div className="px-4 space-y-2 mb-4">
        <p className="text-xs font-semibold font-heading text-muted-foreground uppercase tracking-wider mb-2">Settings</p>

        {/* Connected Apps */}
        <Card className="overflow-hidden">
          <button
            className="w-full p-3 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors"
            onClick={() => {
              // Scroll to connected apps section or open a dialog — for now toast
              toast.info("Connected apps: Strava" + (strava ? " ✓" : " — not connected"));
            }}
          >
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <Flame className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Connected Apps</p>
              <p className="text-[11px] text-muted-foreground">{strava ? "Strava connected" : "No apps connected"}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </Card>

        {/* Push notifications */}
        {permission !== "unsupported" && (
          <Card className="p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <Bell className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Push Notifications</p>
              <p className="text-[11px] text-muted-foreground">
                {permission === "denied" ? "Blocked in browser" : "Challenges & updates"}
              </p>
            </div>
            <Switch
              checked={isSubscribed}
              disabled={pushLoading || permission === "denied"}
              onCheckedChange={(checked) => checked ? subscribe() : unsubscribe()}
            />
          </Card>
        )}

        {/* Email preferences */}
        {emailPrefsAvailable && (
          <Card className="p-3 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <Mail className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Email Preferences</p>
                <p className="text-[11px] text-muted-foreground">Fallback emails and marketing opt-in.</p>
              </div>
              {emailPrefsLoading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : null}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium">Transactional emails</p>
                <p className="text-[11px] text-muted-foreground">Challenges, bookings, match updates.</p>
              </div>
              <Switch
                checked={emailPrefs.transactional_email_enabled}
                disabled={emailPrefsLoading || saveEmailPrefs.isPending}
                onCheckedChange={(checked) => {
                  const next = { ...emailPrefs, transactional_email_enabled: checked };
                  setEmailPrefs(next);
                  saveEmailPrefs.mutate(next);
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium">Email only when no push</p>
                <p className="text-[11px] text-muted-foreground">Avoid duplicate push + email.</p>
              </div>
              <Switch
                checked={emailPrefs.email_fallback_only}
                disabled={emailPrefsLoading || saveEmailPrefs.isPending || !emailPrefs.transactional_email_enabled}
                onCheckedChange={(checked) => {
                  const next = { ...emailPrefs, email_fallback_only: checked };
                  setEmailPrefs(next);
                  saveEmailPrefs.mutate(next);
                }}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium">Marketing emails</p>
                <p className="text-[11px] text-muted-foreground">Events, socials, club announcements.</p>
              </div>
              <Switch
                checked={emailPrefs.marketing_email_enabled}
                disabled={emailPrefsLoading || saveEmailPrefs.isPending}
                onCheckedChange={(checked) => {
                  const next = { ...emailPrefs, marketing_email_enabled: checked };
                  setEmailPrefs(next);
                  saveEmailPrefs.mutate(next);
                }}
              />
            </div>
          </Card>
        )}

        {/* Action buttons */}
        <Button variant="outline" className="w-full justify-start gap-3 h-11" onClick={() => setEditOpen(true)}>
          <Settings className="w-4 h-4" /> Edit Profile
        </Button>
        {canOpenAdmin && (
          <Button variant="outline" className="w-full justify-start gap-3 h-11" asChild>
            <Link to="/admin"><Shield className="w-4 h-4" /> Admin Dashboard</Link>
          </Button>
        )}
        <Button variant="outline" className="w-full justify-start gap-3 h-11 text-destructive hover:text-destructive" onClick={signOut}>
          <LogOut className="w-4 h-4" /> Sign Out
        </Button>

        <div className="px-1">
          <p className="text-[11px] text-muted-foreground">
            Connected database:{" "}
            <span className="font-mono">{supabaseProjectRef || supabaseHostRef || "—"}</span>
          </p>
        </div>
      </div>

      {/* ─── Edit Profile Dialog ─── */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
        }}
      >
        <DialogContent className="flex flex-col max-h-[90vh] overflow-hidden p-0 gap-0">
          <div className="p-6 pb-4 border-b border-border">
            <DialogHeader><DialogTitle>Edit Profile</DialogTitle></DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={edit.name} onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Cell number <span className="text-destructive">*</span></Label>
              <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="e.g. +27 82 123 4567" value={edit.phone} onChange={(e) => setEdit((s) => ({ ...s, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Bio</Label>
              <Textarea placeholder="A short intro about your squash game…" value={edit.bio} onChange={(e) => setEdit((s) => ({ ...s, bio: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input value={edit.location} onChange={(e) => setEdit((s) => ({ ...s, location: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Home club</Label>
                <Input value={edit.home_club} onChange={(e) => setEdit((s) => ({ ...s, home_club: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dominant hand</Label>
                <Select value={edit.dominant_hand} onValueChange={(v) => setEdit((s) => ({ ...s, dominant_hand: v as EditableProfileFields["dominant_hand"] }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="right">Right</SelectItem>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="ambidextrous">Ambidextrous</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Years playing</Label>
                <Input inputMode="numeric" placeholder="e.g. 3" value={edit.years_playing} onChange={(e) => setEdit((s) => ({ ...s, years_playing: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Playing style</Label>
                <Input placeholder="e.g. Aggressive" value={edit.playing_style} onChange={(e) => setEdit((s) => ({ ...s, playing_style: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Favorite shot</Label>
                <Input placeholder="e.g. Backhand drop" value={edit.favorite_shot} onChange={(e) => setEdit((s) => ({ ...s, favorite_shot: e.target.value }))} />
              </div>
            </div>

            {/* Availability */}
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label>Availability</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">When you usually play.</p>
                </div>
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAvailabilityBlocks((prev) => [...prev, { day_of_week: 1, start_time: "18:00", end_time: "19:00" }])}>
                  Add
                </Button>
              </div>
              {availabilityLoading ? (
                <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">Loading…</div>
              ) : availabilityBlocks.length === 0 ? (
                <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">No availability set.</div>
              ) : (
                <div className="space-y-2">
                  {availabilityBlocks.map((b, idx) => (
                    <div key={`${b.day_of_week}-${idx}`} className="rounded-md border border-border p-3 grid grid-cols-4 gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Day</Label>
                        <Select value={String(b.day_of_week)} onValueChange={(v) => setAvailabilityBlocks((prev) => prev.map((x, i) => (i === idx ? { ...x, day_of_week: Number(v) } : x)))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{dayOptions.map((d) => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Start</Label>
                        <Input type="time" value={b.start_time} onChange={(e) => setAvailabilityBlocks((prev) => prev.map((x, i) => (i === idx ? { ...x, start_time: e.target.value } : x)))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">End</Label>
                        <Input type="time" value={b.end_time} onChange={(e) => setAvailabilityBlocks((prev) => prev.map((x, i) => (i === idx ? { ...x, end_time: e.target.value } : x)))} />
                      </div>
                      <Button type="button" size="sm" variant="outline" className="h-9 text-xs" onClick={() => setAvailabilityBlocks((prev) => prev.filter((_, i) => i !== idx))}>✕</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Court check-ins */}
            <div className="space-y-2">
              <p className="text-sm font-semibold font-heading">Court check-in reminders</p>
              <div className="rounded-md border border-border p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Detect unbooked sessions</p>
                  <p className="text-[11px] text-muted-foreground">
                    Uses your location to detect when you’re at the courts so we can remind you to book.
                  </p>
                </div>
                <Switch
                  checked={edit.court_checkins_enabled}
                  onCheckedChange={(checked) => setEdit((s) => ({ ...s, court_checkins_enabled: checked }))}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                You can disable this anytime. Location is only checked when you open the booking screen.
              </p>
            </div>

            <Separator />

            {/* Privacy */}
            <div className="space-y-2">
              <p className="text-sm font-semibold font-heading">Public profile</p>
              {[
                { key: "privacy_show_about", label: "About section", desc: "Bio + style" },
                { key: "privacy_show_availability", label: "Availability", desc: "Weekly windows" },
                { key: "privacy_show_recent_matches", label: "Recent matches", desc: "H2H + results" },
                { key: "privacy_show_training", label: "Training stats", desc: "Strava totals" },
                { key: "privacy_show_advanced_stats", label: "Advanced stats", desc: "Streaks, points" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="rounded-md border border-border p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-[11px] text-muted-foreground">{desc}</p>
                  </div>
                  <Switch checked={(edit as any)[key]} onCheckedChange={(checked) => setEdit((s) => ({ ...s, [key]: checked }))} />
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 pt-4 border-t border-border bg-background">
            <DialogFooter>
              <Button
                onClick={async () => {
                  try {
                    if (!user?.id) throw new Error("You must be logged in");
                    setEditSaving(true);
                    const phoneRaw = edit.phone.trim();
                    const digitsOnly = phoneRaw.replace(/\D/g, "");
                    if (!phoneRaw) throw new Error("Please enter your cell number");
                    if (digitsOnly.length < 9 || digitsOnly.length > 15) throw new Error("Please enter a valid cell number");
                    const years = edit.years_playing.trim() ? Number(edit.years_playing) : null;
                    if (years != null && (!Number.isFinite(years) || years < 0 || years > 80)) throw new Error("Years playing must be 0–80");

                    const updatePayload: any = {
                      name: edit.name.trim(), phone: phoneRaw,
                      bio: edit.bio.trim() || null, location: edit.location.trim() || null,
                      home_club: edit.home_club.trim() || null, dominant_hand: edit.dominant_hand || null,
                      years_playing: years == null ? null : Math.trunc(years),
                      playing_style: edit.playing_style.trim() || null, favorite_shot: edit.favorite_shot.trim() || null,
                      court_checkins_enabled: !!edit.court_checkins_enabled,
                      privacy_show_about: !!edit.privacy_show_about, privacy_show_availability: !!edit.privacy_show_availability,
                      privacy_show_recent_matches: !!edit.privacy_show_recent_matches, privacy_show_training: !!edit.privacy_show_training,
                      privacy_show_advanced_stats: !!edit.privacy_show_advanced_stats,
                    };

                    let { error } = await supabase.from("profiles").update(updatePayload).eq("id", user.id);
                    // If the DB hasn't been migrated yet, retry without new columns instead of blocking profile edits.
                    if (error?.code === "42703") {
                      delete updatePayload.court_checkins_enabled;
                      ({ error } = await supabase.from("profiles").update(updatePayload).eq("id", user.id));
                    }
                    if (error) throw error;

                    const cleanedBlocks = availabilityBlocks
                      .map((b) => ({ day_of_week: Number(b.day_of_week), start_time: String(b.start_time || "").trim(), end_time: String(b.end_time || "").trim() }))
                      .filter((b) => b.start_time && b.end_time);
                    for (const b of cleanedBlocks) {
                      if (b.day_of_week < 1 || b.day_of_week > 7) throw new Error("Invalid day");
                      if (b.end_time <= b.start_time) throw new Error("End time must be after start");
                    }
                    const { error: availabilityError } = await (supabase.rpc as any)("set_my_availability", { blocks: cleanedBlocks });
                    if (availabilityError) throw availabilityError;

                    await queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
                    await queryClient.invalidateQueries({ queryKey: ["player-profile", user.id] });
                    toast.success("Profile updated");
                    setEditOpen(false);
                  } catch (e: any) { toast.error(e.message || "Failed"); } finally { setEditSaving(false); }
                }}
                disabled={editSaving}
              >
                {editSaving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
