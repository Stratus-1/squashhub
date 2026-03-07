import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { StatCard } from "@/components/StatCard";
import { IntegrationLogo } from "@/components/IntegrationLogo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Target, TrendingUp, Settings, LogOut, Loader2, Bell, Shield } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { HeadToHeadRow, useHeadToHead, useIntegrations, useMyRoles, useProfile, useSquashTotals } from "@/hooks/use-data";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Link } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  bio: string;
  location: string;
  home_club: string;
  dominant_hand: "" | "right" | "left" | "ambidextrous";
  years_playing: string;
  playing_style: string;
  favorite_shot: string;
  privacy_show_about: boolean;
  privacy_show_availability: boolean;
  privacy_show_recent_matches: boolean;
  privacy_show_training: boolean;
  privacy_show_advanced_stats: boolean;
};

type AvailabilityBlock = {
  day_of_week: number; // 1=Mon ... 7=Sun
  start_time: string; // HH:MM
  end_time: string; // HH:MM
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

function ComingSoonAppCard({
  provider,
  title,
  subtitle,
  learnMoreText,
  className,
}: {
  provider: "apple_health" | "samsung_health" | "huawei_health" | "garmin";
  title: string;
  subtitle: string;
  learnMoreText: string;
  className?: string;
}) {
  return (
    <div className={["rounded-lg border bg-card p-4 h-full flex flex-col", className || ""].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <IntegrationLogo provider={provider} className="opacity-40 grayscale" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <Badge variant="secondary" className="bg-muted text-muted-foreground">
          Coming soon
        </Badge>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs mt-3 w-full"
        onClick={() => toast(learnMoreText)}
      >
        Learn more
      </Button>
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
    name: "",
    bio: "",
    location: "",
    home_club: "",
    dominant_hand: "",
    years_playing: "",
    playing_style: "",
    favorite_shot: "",
    privacy_show_about: true,
    privacy_show_availability: true,
    privacy_show_recent_matches: true,
    privacy_show_training: true,
    privacy_show_advanced_stats: true,
  });
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<AvailabilityBlock[]>([]);

  const strava = useMemo(
    () => integrations?.find((i) => i.provider === "strava") || null,
    [integrations]
  );

  const publicWebBaseUrl = (import.meta.env.VITE_PUBLIC_URL as string | undefined)
    ?.trim()
    ?.replace(/\/+$/, "");

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
    ?.trim()
    ?.replace(/\/+$/, "");

  const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`realtime:profiles:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
          queryClient.invalidateQueries({ queryKey: ["ladder"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, user?.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const winRate = profile && profile.matches_played > 0
    ? Math.round((profile.wins / profile.matches_played) * 100)
    : 0;

  const initials = profile?.name
    ? profile.name.split(" ").map((n: string) => n[0]).join("").toUpperCase()
    : "?";

  const stravaDistanceM =
    (profile as any)?.strava_distance_m != null ? Number((profile as any).strava_distance_m) : null;
  const stravaMovingTimeS =
    (profile as any)?.strava_moving_time_s != null ? Number((profile as any).strava_moving_time_s) : null;

  const stravaKm =
    stravaDistanceM != null ? Math.round((stravaDistanceM / 1000) * 10) / 10 : null;
  const stravaMinutes =
    stravaMovingTimeS != null ? Math.round(stravaMovingTimeS / 60) : null;
  const stravaElevationRaw =
    (profile as any)?.strava_elevation_m != null ? Number((profile as any).strava_elevation_m) : null;
  const stravaElevationM =
    stravaElevationRaw != null ? Math.round(stravaElevationRaw * 10) / 10 : null;
  const stravaAvgSpeedKmh =
    stravaDistanceM != null && stravaMovingTimeS != null && stravaMovingTimeS > 0
      ? Math.round(((stravaDistanceM / stravaMovingTimeS) * 3.6) * 10) / 10
      : null;
  const stravaPaceSecPerKm =
    stravaDistanceM != null && stravaMovingTimeS != null && stravaDistanceM > 0
      ? stravaMovingTimeS / (stravaDistanceM / 1000)
      : null;
  const stravaPace = (() => {
    if (stravaPaceSecPerKm == null || !Number.isFinite(stravaPaceSecPerKm)) return null;
    const paceSeconds = Math.max(0, Math.round(stravaPaceSecPerKm));
    const mm = Math.floor(paceSeconds / 60);
    const ss = paceSeconds % 60;
    return `${mm}:${String(ss).padStart(2, "0")} /km`;
  })();
  const stravaLastSync =
    (profile as any)?.strava_last_sync_at ? new Date((profile as any).strava_last_sync_at as string) : null;
  const stravaActivitiesCount =
    typeof (profile as any)?.strava_activities_count === "number" ? ((profile as any).strava_activities_count as number) : null;

  const canOpenAdmin =
    (myRoles || []).includes("admin") || (myRoles || []).includes("moderator");

  const rivals = useMemo(() => {
    const rows = (headToHead || []) as HeadToHeadRow[];
    return rows
      .filter((r) => r.matches >= 2)
      .slice()
      .sort((a, b) => {
        if (b.matches !== a.matches) return b.matches - a.matches;
        return Math.abs(a.win_rate - 50) - Math.abs(b.win_rate - 50);
      })
      .slice(0, 3);
  }, [headToHead]);

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Profile" />

      <motion.div
        className="flex flex-col items-center px-4 mt-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <PlayerAvatar initials={initials} rank={profile?.rank} size="lg" />
        <h2 className="text-lg font-bold font-heading mt-3">{profile?.name || "New Player"}</h2>
        <p className="text-sm text-muted-foreground">{profile?.email}</p>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 mt-4">
        <StatCard label="Rank" value={profile?.rank ? `#${profile.rank}` : "—"} icon={<Trophy className="w-4 h-4" />} />
        <StatCard label="Played" value={profile?.matches_played || 0} icon={<Target className="w-4 h-4" />} />
        <StatCard label="Wins" value={profile?.wins || 0} variant="win" />
        <StatCard label="Win %" value={`${winRate}%`} icon={<TrendingUp className="w-4 h-4" />} />
      </div>

      <div className="px-4 mt-3">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold font-heading">Squash Stats</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Competitive confirmed matches (ladder-recordable).
              </p>
            </div>
          </div>

          {squashTotalsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : squashTotals && squashTotals.matches > 0 ? (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg duration</p>
                <p className="text-sm font-semibold">{squashTotals.avg_duration_min != null ? `${squashTotals.avg_duration_min} min` : "—"}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Streak</p>
                <p className="text-sm font-semibold">{squashTotals.current_streak || "—"}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sets F/A</p>
                <p className="text-sm font-semibold tabular-nums">
                  {squashTotals.sets_for}-{squashTotals.sets_against}
                </p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Points F/A</p>
                <p className="text-sm font-semibold tabular-nums">
                  {squashTotals.points_for}-{squashTotals.points_against}
                </p>
              </div>

              <p className="text-[11px] text-muted-foreground col-span-2 sm:col-span-4">
                Best streaks: <span className="text-foreground font-medium">W{squashTotals.best_win_streak}</span>{" "}
                · <span className="text-foreground font-medium">L{squashTotals.best_loss_streak}</span>
                {squashTotals.last_match_date ? (
                  <>
                    {" "}
                    · Last match: <span className="text-foreground font-medium">{squashTotals.last_match_date}</span>
                  </>
                ) : null}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-2">No confirmed competitive matches yet.</p>
          )}
        </Card>
      </div>

      {headToHeadLoading ? (
        <div className="px-4 mt-3">
          <Card className="p-4">
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          </Card>
        </div>
      ) : (headToHead && headToHead.length > 0) ? (
        <div className="px-4 mt-3">
          <Card className="p-4">
            <p className="text-sm font-semibold font-heading">Head-to-head</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your most played opponents.
            </p>

            {rivals.length > 0 ? (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {rivals.map((r) => (
                  <div key={r.opponent_id} className="rounded-md border p-3">
                    <p className="text-sm font-medium truncate">{r.opponent_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.matches} matches · {r.wins}W {r.losses}L · {r.win_rate}% win
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Opponent</TableHead>
                    <TableHead className="w-[18%]">W/L</TableHead>
                    <TableHead className="w-[22%]">Sets</TableHead>
                    <TableHead className="w-[20%] text-right">Last</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(headToHead || []).slice(0, 6).map((r) => (
                    <TableRow key={r.opponent_id}>
                      <TableCell className="p-3 text-sm">{r.opponent_name}</TableCell>
                      <TableCell className="p-3 text-sm tabular-nums">{r.wins}-{r.losses}</TableCell>
                      <TableCell className="p-3">
                        <p className="text-sm tabular-nums">{r.sets_for}-{r.sets_against}</p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {r.points_for}-{r.points_against} pts
                        </p>
                      </TableCell>
                      <TableCell className="p-3 text-sm text-right text-muted-foreground tabular-nums">
                        {r.last_match_date || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      ) : null}

      <div className="px-4 mt-3">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold font-heading">Training Stats</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {strava ? "Strava totals from your last sync." : "Connect Strava to show training totals."}
              </p>
            </div>
            <div className="shrink-0">
              <IntegrationLogo provider="strava" className={strava ? "" : "opacity-40 grayscale"} />
            </div>
          </div>

          {strava ? (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Distance</p>
                <p className="text-sm font-semibold">{stravaKm != null ? `${stravaKm} km` : "—"}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Time</p>
                <p className="text-sm font-semibold">{stravaMinutes != null ? `${stravaMinutes} min` : "—"}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Elevation</p>
                <p className="text-sm font-semibold">{stravaElevationM != null ? `${stravaElevationM} m` : "—"}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Activities</p>
                <p className="text-sm font-semibold">{stravaActivitiesCount != null ? stravaActivitiesCount : "—"}</p>
              </div>
              <p className="text-[11px] text-muted-foreground col-span-2 sm:col-span-4">
                {stravaLastSync ? `Last synced: ${stravaLastSync.toLocaleString()}` : "Not synced yet — tap Sync in Connected Apps."}
              </p>
              {stravaDistanceM != null && stravaMovingTimeS != null && stravaElevationRaw != null && (
                <p className="text-[11px] text-muted-foreground col-span-2 sm:col-span-4">
                  Raw totals: {stravaDistanceM} m · {stravaMovingTimeS} s · {Math.round(stravaElevationRaw * 10) / 10} m
                </p>
              )}
              {(stravaAvgSpeedKmh != null || stravaPace) && (
                <p className="text-[11px] text-muted-foreground col-span-2 sm:col-span-4">
                  {stravaAvgSpeedKmh != null ? `Avg speed: ${stravaAvgSpeedKmh} km/h` : ""}
                  {stravaAvgSpeedKmh != null && stravaPace ? " · " : ""}
                  {stravaPace ? `Pace: ${stravaPace}` : ""}
                </p>
              )}
            </div>
          ) : null}

          {strava && (
            <div className="mt-3">
              <Button
                variant="secondary"
                className="w-full"
                disabled={stravaRecentLoading || !supabaseUrl || !supabaseKey}
                onClick={async () => {
                  try {
                    setStravaRecentLoading(true);
                    const { data: sessionData } = await supabase.auth.getSession();
                    const accessToken = sessionData.session?.access_token;
                    if (!accessToken) throw new Error("You must be logged in");
                    if (!accessToken.startsWith("eyJ") || accessToken.split(".").length !== 3) {
                      throw new Error("Your login session looks invalid. Please sign out and sign in again.");
                    }
                    if (!supabaseUrl) throw new Error("Missing VITE_SUPABASE_URL");
                    if (!supabaseKey) throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY");

                    const res = await fetch(`${supabaseUrl}/functions/v1/strava`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        apikey: supabaseKey,
                        Authorization: `Bearer ${accessToken}`,
                      },
                      body: JSON.stringify({ action: "recent" }),
                    });
                    const payload = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(payload?.error || "Failed to load recent activities");
                    setStravaRecent((payload.activities || []) as StravaActivityPreview[]);
                  } catch (e: any) {
                    toast.error(e.message || "Failed to load recent activities");
                  } finally {
                    setStravaRecentLoading(false);
                  }
                }}
              >
                {stravaRecentLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading Strava activities…
                  </>
                ) : (
                  "Show recent Strava activities"
                )}
              </Button>

              {stravaRecent && stravaRecent.length > 0 && (
                <div className="mt-3 space-y-2">
                  {stravaRecent.slice(0, 5).map((a) => {
                    const km = Math.round((a.distance / 1000) * 10) / 10;
                    const minutes = Math.round(a.moving_time / 60);
                    const elevation = Math.round(a.total_elevation_gain * 10) / 10;
                    return (
                      <div key={a.id} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{a.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(a.start_date).toLocaleString()} · {a.sport_type || a.type}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums">{km} km</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {minutes} min · {elevation} m
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Separator className="my-5 mx-4" />

      <div className="px-4 space-y-2 mb-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold font-heading">Connected Apps</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Connect fitness apps to enrich your training stats.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border bg-card p-4 h-full flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <IntegrationLogo provider="strava" className={strava ? "" : "opacity-40 grayscale"} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">Strava</p>
                    <p className="text-xs text-muted-foreground">
                      {strava?.display_name
                        ? `Connected as ${strava.display_name}`
                        : "Sync your recent activities (running/cycling/training)"}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={strava ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}
                >
                  {strava ? "Connected" : "Not connected"}
                </Badge>
              </div>

              {strava && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  {stravaActivitiesCount != null ? `${stravaActivitiesCount} activities` : "—"}
                  {stravaKm != null ? ` · ${stravaKm} km` : ""}
                  {stravaMinutes != null ? ` · ${stravaMinutes} min` : ""}
                  {stravaElevationM != null ? ` · ${stravaElevationM} m` : ""}
                </p>
              )}

              <div className={`mt-3 grid gap-2 ${strava ? "grid-cols-2" : "grid-cols-1"}`}>
                {strava ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs w-full"
                      disabled={stravaSyncing}
                      onClick={async () => {
                        try {
                          setStravaSyncing(true);
                          const { data: sessionData } = await supabase.auth.getSession();
                          const accessToken = sessionData.session?.access_token;
                          if (!accessToken) throw new Error("You must be logged in");
                          if (!accessToken.startsWith("eyJ") || accessToken.split(".").length !== 3) {
                            throw new Error("Your login session looks invalid. Please sign out and sign in again.");
                          }
                          if (!supabaseUrl) throw new Error("Missing VITE_SUPABASE_URL");
                          if (!supabaseKey) throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY");

                          const res = await fetch(`${supabaseUrl}/functions/v1/strava`, {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              apikey: supabaseKey,
                              Authorization: `Bearer ${accessToken}`,
                            },
                            body: JSON.stringify({ action: "sync" }),
                          });

                          const payload = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error(payload?.error || "Sync failed");
                          if (!payload?.totals) throw new Error("Sync failed");

                          const km = Math.round((payload.totals.distance_m / 1000) * 10) / 10;
                          const minutes = Math.round(payload.totals.moving_time_s / 60);
                          const elevation = Math.round(payload.totals.elevation_m * 10) / 10;
                          toast.success(`Synced: ${km} km · ${minutes} min · ${elevation} m (last ${payload.activitiesCount} activities)`);
                          queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
                          queryClient.invalidateQueries({ queryKey: ["ladder"] });
                          queryClient.invalidateQueries({ queryKey: ["integrations"] });
                        } catch (e: any) {
                          toast.error(e.message || "Sync failed");
                        } finally {
                          setStravaSyncing(false);
                        }
                      }}
                    >
                      {stravaSyncing ? "Syncing…" : "Sync"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs w-full"
                      disabled={stravaSyncing}
                      onClick={async () => {
                        try {
                          const { data: sessionData } = await supabase.auth.getSession();
                          const accessToken = sessionData.session?.access_token;
                          if (!accessToken) throw new Error("You must be logged in");
                          if (!accessToken.startsWith("eyJ") || accessToken.split(".").length !== 3) {
                            throw new Error("Your login session looks invalid. Please sign out and sign in again.");
                          }
                          if (!supabaseUrl) throw new Error("Missing VITE_SUPABASE_URL");
                          if (!supabaseKey) throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY");

                          const res = await fetch(`${supabaseUrl}/functions/v1/strava`, {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              apikey: supabaseKey,
                              Authorization: `Bearer ${accessToken}`,
                            },
                            body: JSON.stringify({ action: "disconnect" }),
                          });

                          const payload = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error(payload?.error || "Failed to disconnect");
                          if (!payload?.disconnected) throw new Error("Failed to disconnect");
                          toast.success("Strava disconnected");
                          queryClient.invalidateQueries({ queryKey: ["integrations"] });
                          queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
                          queryClient.invalidateQueries({ queryKey: ["ladder"] });
                        } catch (e: any) {
                          toast.error(e.message || "Failed to disconnect");
                        }
                      }}
                    >
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 text-xs w-full"
                    onClick={async () => {
                      const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
                      if (!clientId) {
                        toast.error("Missing VITE_STRAVA_CLIENT_ID");
                        return;
                      }

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
                    }}
                  >
                    Connect
                  </Button>
                )}
              </div>
            </div>

            <ComingSoonAppCard
              provider="apple_health"
              title="Apple Health"
              subtitle="Requires an iPhone app (HealthKit)."
              learnMoreText="Coming soon: Apple Health requires an iOS app integration."
            />

            <ComingSoonAppCard
              provider="samsung_health"
              title="Samsung Health"
              subtitle="Requires an Android app / Samsung SDK."
              learnMoreText="Coming soon: Samsung Health needs an Android app integration."
            />

            <ComingSoonAppCard
              provider="huawei_health"
              title="Huawei Health"
              subtitle="Requires Huawei Health Kit + Huawei ID."
              learnMoreText="Huawei Health connection requires a native app integration (Huawei Health Kit + Huawei ID). Coming soon."
            />

            <ComingSoonAppCard
              provider="garmin"
              title="Garmin"
              subtitle="Usually requires Garmin partner approval."
              learnMoreText="Coming soon: Garmin integration usually requires partner approval."
              className="sm:col-span-2"
            />
          </div>
        </Card>

        {permission !== "unsupported" && (
          <Card className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Push Notifications</p>
                <p className="text-xs text-muted-foreground">
                  {permission === "denied" ? "Blocked in browser settings" : "Challenges, matches & updates"}
                </p>
              </div>
            </div>
            <Switch
              checked={isSubscribed}
              disabled={pushLoading || permission === "denied"}
              onCheckedChange={(checked) => checked ? subscribe() : unsubscribe()}
            />
          </Card>
        )}
        <Button variant="outline" className="w-full justify-start gap-3" onClick={() => setEditOpen(true)}>
          <Settings className="w-4 h-4" /> Edit Profile
        </Button>
        {canOpenAdmin && (
          <Button variant="outline" className="w-full justify-start gap-3" asChild>
            <Link to="/admin">
              <Shield className="w-4 h-4" /> Admin Dashboard
            </Link>
          </Button>
        )}
        <Button
          variant="outline"
          className="w-full justify-start gap-3 text-destructive hover:text-destructive"
          onClick={signOut}
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </Button>
      </div>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (open && profile) {
            setEdit({
              name: profile.name || "",
              bio: (profile as any).bio || "",
              location: (profile as any).location || "",
              home_club: (profile as any).home_club || "",
              dominant_hand: ((profile as any).dominant_hand as EditableProfileFields["dominant_hand"]) || "",
              years_playing: (profile as any).years_playing != null ? String((profile as any).years_playing) : "",
              playing_style: (profile as any).playing_style || "",
              favorite_shot: (profile as any).favorite_shot || "",
              privacy_show_about: (profile as any).privacy_show_about ?? true,
              privacy_show_availability: (profile as any).privacy_show_availability ?? true,
              privacy_show_recent_matches: (profile as any).privacy_show_recent_matches ?? true,
              privacy_show_training: (profile as any).privacy_show_training ?? true,
              privacy_show_advanced_stats: (profile as any).privacy_show_advanced_stats ?? true,
            });
          }

          if (open && user?.id) {
            setAvailabilityLoading(true);
            supabase
              .from("player_availability")
              .select("day_of_week,start_time,end_time")
              .eq("user_id", user.id)
              .order("day_of_week", { ascending: true })
              .order("start_time", { ascending: true })
              .then(({ data, error }) => {
                if (error) throw error;
                const blocks = (data || []).map((b: any) => ({
                  day_of_week: Number(b.day_of_week),
                  start_time: String(b.start_time || "").slice(0, 5),
                  end_time: String(b.end_time || "").slice(0, 5),
                })) as AvailabilityBlock[];
                setAvailabilityBlocks(blocks);
              })
              .catch((e: any) => {
                toast.error(e.message || "Failed to load availability");
              })
              .finally(() => setAvailabilityLoading(false));
          }
        }}
      >
        <DialogContent className="flex flex-col max-h-[90vh] overflow-hidden p-0 gap-0">
          <div className="p-6 pb-4 border-b">
            <DialogHeader>
              <DialogTitle>Edit Profile</DialogTitle>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={edit.name} onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>Bio</Label>
              <Textarea
                placeholder="A short intro about your squash game…"
                value={edit.bio}
                onChange={(e) => setEdit((s) => ({ ...s, bio: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input value={edit.location} onChange={(e) => setEdit((s) => ({ ...s, location: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Home club</Label>
                <Input value={edit.home_club} onChange={(e) => setEdit((s) => ({ ...s, home_club: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dominant hand</Label>
                <Select
                  value={edit.dominant_hand}
                  onValueChange={(v) => setEdit((s) => ({ ...s, dominant_hand: v as EditableProfileFields["dominant_hand"] }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="right">Right</SelectItem>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="ambidextrous">Ambidextrous</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Years playing</Label>
                <Input
                  inputMode="numeric"
                  placeholder="e.g. 3"
                  value={edit.years_playing}
                  onChange={(e) => setEdit((s) => ({ ...s, years_playing: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Playing style</Label>
                <Input
                  placeholder="e.g. Aggressive / Defensive"
                  value={edit.playing_style}
                  onChange={(e) => setEdit((s) => ({ ...s, playing_style: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Favorite shot</Label>
                <Input
                  placeholder="e.g. Backhand drop"
                  value={edit.favorite_shot}
                  onChange={(e) => setEdit((s) => ({ ...s, favorite_shot: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label>Availability</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Add structured time windows so others can see when you usually play.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() =>
                    setAvailabilityBlocks((prev) => [
                      ...prev,
                      { day_of_week: 1, start_time: "18:00", end_time: "19:00" },
                    ])
                  }
                >
                  Add
                </Button>
              </div>

              {(profile as any)?.availability ? (
                <div className="rounded-md border p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Summary</p>
                  <p className="text-sm mt-1">{String((profile as any).availability)}</p>
                </div>
              ) : null}

              {availabilityLoading ? (
                <div className="rounded-md border p-3 text-sm text-muted-foreground">Loading availability…</div>
              ) : availabilityBlocks.length === 0 ? (
                <div className="rounded-md border p-3 text-sm text-muted-foreground">
                  No availability set yet. Tap “Add” to add a time window.
                </div>
              ) : (
                <div className="space-y-2">
                  {availabilityBlocks.map((b, idx) => (
                    <div key={`${b.day_of_week}-${b.start_time}-${idx}`} className="rounded-md border p-3">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Day</Label>
                          <Select
                            value={String(b.day_of_week)}
                            onValueChange={(v) =>
                              setAvailabilityBlocks((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, day_of_week: Number(v) } : x))
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Day" />
                            </SelectTrigger>
                            <SelectContent>
                              {dayOptions.map((d) => (
                                <SelectItem key={d.value} value={String(d.value)}>
                                  {d.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Start</Label>
                          <Input
                            type="time"
                            step={1800}
                            value={b.start_time}
                            onChange={(e) =>
                              setAvailabilityBlocks((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, start_time: e.target.value } : x))
                              )
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">End</Label>
                          <Input
                            type="time"
                            step={1800}
                            value={b.end_time}
                            onChange={(e) =>
                              setAvailabilityBlocks((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, end_time: e.target.value } : x))
                              )
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-10 sm:h-9 text-xs"
                          onClick={() => setAvailabilityBlocks((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator className="my-2" />

            <div className="space-y-2">
              <div>
                <p className="text-sm font-semibold font-heading">Public profile</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Control what other players can see when viewing your profile.
                </p>
              </div>

              <div className="rounded-md border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">About section</p>
                  <p className="text-[11px] text-muted-foreground">Bio + playing style details</p>
                </div>
                <Switch
                  checked={edit.privacy_show_about}
                  onCheckedChange={(checked) => setEdit((s) => ({ ...s, privacy_show_about: checked }))}
                />
              </div>

              <div className="rounded-md border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Availability</p>
                  <p className="text-[11px] text-muted-foreground">Your weekly time windows</p>
                </div>
                <Switch
                  checked={edit.privacy_show_availability}
                  onCheckedChange={(checked) => setEdit((s) => ({ ...s, privacy_show_availability: checked }))}
                />
              </div>

              <div className="rounded-md border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Recent matches</p>
                  <p className="text-[11px] text-muted-foreground">Head-to-head + recent results list</p>
                </div>
                <Switch
                  checked={edit.privacy_show_recent_matches}
                  onCheckedChange={(checked) => setEdit((s) => ({ ...s, privacy_show_recent_matches: checked }))}
                />
              </div>

              <div className="rounded-md border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Training stats</p>
                  <p className="text-[11px] text-muted-foreground">Strava totals + activities</p>
                </div>
                <Switch
                  checked={edit.privacy_show_training}
                  onCheckedChange={(checked) => setEdit((s) => ({ ...s, privacy_show_training: checked }))}
                />
              </div>

              <div className="rounded-md border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Advanced squash stats</p>
                  <p className="text-[11px] text-muted-foreground">Streaks, points/sets, averages</p>
                </div>
                <Switch
                  checked={edit.privacy_show_advanced_stats}
                  onCheckedChange={(checked) => setEdit((s) => ({ ...s, privacy_show_advanced_stats: checked }))}
                />
              </div>
            </div>
          </div>

          <div className="p-6 pt-4 border-t bg-background">
            <DialogFooter>
              <Button
                onClick={async () => {
                  try {
                    if (!user?.id) throw new Error("You must be logged in");
                    setEditSaving(true);
                    const years = edit.years_playing.trim() ? Number(edit.years_playing) : null;
                    if (years != null && (!Number.isFinite(years) || years < 0 || years > 80)) {
                      throw new Error("Years playing must be between 0 and 80");
                    }

                    const { error } = await supabase
                      .from("profiles")
                      .update({
                        name: edit.name.trim(),
                        bio: edit.bio.trim() || null,
                        location: edit.location.trim() || null,
                        home_club: edit.home_club.trim() || null,
                        dominant_hand: edit.dominant_hand || null,
                        years_playing: years == null ? null : Math.trunc(years),
                        playing_style: edit.playing_style.trim() || null,
                        favorite_shot: edit.favorite_shot.trim() || null,
                        privacy_show_about: !!edit.privacy_show_about,
                        privacy_show_availability: !!edit.privacy_show_availability,
                        privacy_show_recent_matches: !!edit.privacy_show_recent_matches,
                        privacy_show_training: !!edit.privacy_show_training,
                        privacy_show_advanced_stats: !!edit.privacy_show_advanced_stats,
                      } as any)
                      .eq("id", user.id);
                    if (error) throw error;

                    const cleanedBlocks = availabilityBlocks
                      .map((b) => ({
                        day_of_week: Number(b.day_of_week),
                        start_time: String(b.start_time || "").trim(),
                        end_time: String(b.end_time || "").trim(),
                      }))
                      .filter((b) => b.start_time && b.end_time);

                    for (const b of cleanedBlocks) {
                      if (!Number.isFinite(b.day_of_week) || b.day_of_week < 1 || b.day_of_week > 7) {
                        throw new Error("Availability day must be between Monday and Sunday");
                      }
                      if (b.start_time.length !== 5 || b.end_time.length !== 5) {
                        throw new Error("Availability times must be HH:MM");
                      }
                      if (b.end_time <= b.start_time) {
                        throw new Error("Availability end time must be after start time");
                      }
                    }

                    const { error: availabilityError } = await supabase.rpc("set_my_availability", {
                      blocks: cleanedBlocks,
                    } as any);
                    if (availabilityError) throw availabilityError;

                    await queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
                    await queryClient.invalidateQueries({ queryKey: ["player-profile", user.id] });
                    await queryClient.invalidateQueries({ queryKey: ["bookings"] });
                    toast.success("Profile updated");
                    setEditOpen(false);
                  } catch (e: any) {
                    toast.error(e.message || "Failed to update profile");
                  } finally {
                    setEditSaving(false);
                  }
                }}
                disabled={editSaving}
              >
                {editSaving ? "Saving…" : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
