import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { StatCard } from "@/components/StatCard";
import { IntegrationLogo } from "@/components/IntegrationLogo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Trophy, Target, TrendingUp, Settings, LogOut, Loader2, Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIntegrations, useProfile } from "@/hooks/use-data";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";

export default function Profile() {
  const { signOut, user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const { data: integrations } = useIntegrations();
  const { permission, isSubscribed, loading: pushLoading, subscribe, unsubscribe } = usePushNotifications();
  const queryClient = useQueryClient();
  const [stravaSyncing, setStravaSyncing] = useState(false);

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

  const stravaKm =
    typeof (profile as any)?.strava_distance_m === "number" || typeof (profile as any)?.strava_distance_m === "bigint"
      ? Math.round((Number((profile as any).strava_distance_m) / 1000) * 10) / 10
      : null;
  const stravaMinutes =
    typeof (profile as any)?.strava_moving_time_s === "number"
      ? Math.round(Number((profile as any).strava_moving_time_s) / 60)
      : null;
  const stravaLastSync =
    (profile as any)?.strava_last_sync_at ? new Date((profile as any).strava_last_sync_at as string) : null;
  const stravaActivitiesCount =
    typeof (profile as any)?.strava_activities_count === "number" ? ((profile as any).strava_activities_count as number) : null;

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
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Distance</p>
                <p className="text-sm font-semibold">{stravaKm != null ? `${stravaKm} km` : "—"}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Time</p>
                <p className="text-sm font-semibold">{stravaMinutes != null ? `${stravaMinutes} min` : "—"}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Activities</p>
                <p className="text-sm font-semibold">{stravaActivitiesCount != null ? stravaActivitiesCount : "—"}</p>
              </div>
              <p className="text-[11px] text-muted-foreground col-span-3">
                {stravaLastSync ? `Last synced: ${stravaLastSync.toLocaleString()}` : "Not synced yet — tap Sync in Connected Apps."}
              </p>
            </div>
          ) : null}
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

          <div className="mt-4 space-y-2">
            {/* Strava */}
            <div className="flex items-center justify-between gap-3">
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
              <div className="shrink-0">
                {strava ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
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
                          toast.success(`Synced: ${km} km · ${minutes} min (last ${payload.activitiesCount} activities)`);
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
                      className="h-8 text-xs"
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
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 text-xs"
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

            <Separator />

            {/* Apple Health */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <IntegrationLogo provider="apple_health" className="opacity-40 grayscale" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">Apple Health</p>
                  <p className="text-xs text-muted-foreground">
                    Requires an iPhone app (HealthKit). Web browsers can’t read Health data directly.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => toast("Coming soon: Apple Health requires an iOS app integration.")}
              >
                Learn more
              </Button>
            </div>

            {/* Samsung Health */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <IntegrationLogo provider="samsung_health" className="opacity-40 grayscale" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">Samsung Health</p>
                  <p className="text-xs text-muted-foreground">
                    Requires an Android app / Samsung SDK integration; not available from the web.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => toast("Coming soon: Samsung Health needs an Android app integration.")}
              >
                Learn more
              </Button>
            </div>

            {/* Huawei Health */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <IntegrationLogo provider="huawei_health" className="opacity-40 grayscale" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">Huawei Health</p>
                  <p className="text-xs text-muted-foreground">
                    Requires a mobile app integration (Huawei Health Kit / Huawei ID). Not available from the web.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() =>
                  toast(
                    "Huawei Health connection requires a native app integration (Huawei Health Kit + Huawei ID). Coming soon."
                  )
                }
              >
                Connect
              </Button>
            </div>

            {/* Garmin */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <IntegrationLogo provider="garmin" className="opacity-40 grayscale" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">Garmin</p>
                  <p className="text-xs text-muted-foreground">
                    Typically requires a Garmin partner integration to access user activity data.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => toast("Coming soon: Garmin integration usually requires partner approval.")}
              >
                Learn more
              </Button>
            </div>
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
        <Button variant="outline" className="w-full justify-start gap-3">
          <Settings className="w-4 h-4" /> Edit Profile
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start gap-3 text-destructive hover:text-destructive"
          onClick={signOut}
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </Button>
      </div>
    </div>
  );
}
