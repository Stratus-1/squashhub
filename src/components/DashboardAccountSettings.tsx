import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { Bell, ChevronRight, Flame, Lock, LogOut, Mail, MapPin, Search, Shield, SlidersHorizontal, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIntegrations, useMyRoles, useProfile } from "@/hooks/use-data";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useMemberContext } from "@/contexts/MemberContext";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IntegrationLogo } from "@/components/IntegrationLogo";

function toBool(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function getPublicWebBaseUrl() {
  return (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim()?.replace(/\/+$/, "") || window.location.origin;
}

export function DashboardAccountSettings() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const { data: integrations } = useIntegrations();
  const { data: myRoles } = useMyRoles();
  const { permission, isSubscribed, loading: pushLoading, subscribe, unsubscribe } = usePushNotifications();

  const strava = useMemo(() => integrations?.find((i: any) => i.provider === "strava") || null, [integrations]);
  const canOpenAdmin = (myRoles || []).includes("admin") || (myRoles || []).includes("moderator");

  const [courtCheckinsEnabled, setCourtCheckinsEnabled] = useState<boolean>(false);
  const [privacy, setPrivacy] = useState({
    privacy_show_about: true,
    privacy_show_availability: true,
    privacy_show_recent_matches: true,
    privacy_show_training: true,
    privacy_show_advanced_stats: true,
  });

  useEffect(() => {
    setCourtCheckinsEnabled(toBool((profile as any)?.court_checkins_enabled, false));
    setPrivacy({
      privacy_show_about: toBool((profile as any)?.privacy_show_about, true),
      privacy_show_availability: toBool((profile as any)?.privacy_show_availability, true),
      privacy_show_recent_matches: toBool((profile as any)?.privacy_show_recent_matches, true),
      privacy_show_training: toBool((profile as any)?.privacy_show_training, true),
      privacy_show_advanced_stats: toBool((profile as any)?.privacy_show_advanced_stats, true),
    });
  }, [profile]);

  const saveProfilePrefs = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      if (!user?.id) throw new Error("Not signed in");
      let { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
      if (error?.code === "42703") {
        // DB may not have been migrated for some newer preference columns. Retry without blocking the UI.
        const fallback = { ...patch };
        delete fallback.court_checkins_enabled;
        delete fallback.privacy_show_about;
        delete fallback.privacy_show_availability;
        delete fallback.privacy_show_recent_matches;
        delete fallback.privacy_show_training;
        delete fallback.privacy_show_advanced_stats;
        ({ error } = await supabase.from("profiles").update(fallback).eq("id", user.id));
      }
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast.success("Preferences saved");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save preferences"),
  });

  const { data: emailPrefsResult, isLoading: emailPrefsLoading } = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: async () => {
      if (!user?.id) return { available: false, prefs: null as any };
      const { data, error } = await (supabase as any)
        .from("notification_preferences")
        .select("transactional_email_enabled,marketing_email_enabled,email_fallback_only")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        if (error.code === "42P01") return { available: false, prefs: null as any };
        if (error.code === "PGRST116") return { available: true, prefs: null as any };
        throw error;
      }
      return {
        available: true,
        prefs: data || {
          transactional_email_enabled: true,
          marketing_email_enabled: false,
          email_fallback_only: true,
        },
      };
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const [emailPrefs, setEmailPrefs] = useState<{
    transactional_email_enabled: boolean;
    marketing_email_enabled: boolean;
    email_fallback_only: boolean;
  }>({
    transactional_email_enabled: true,
    marketing_email_enabled: false,
    email_fallback_only: true,
  });

  useEffect(() => {
    if (!emailPrefsResult?.available) return;
    if (!emailPrefsResult.prefs) return;
    setEmailPrefs({
      transactional_email_enabled: !!emailPrefsResult.prefs.transactional_email_enabled,
      marketing_email_enabled: !!emailPrefsResult.prefs.marketing_email_enabled,
      email_fallback_only: !!emailPrefsResult.prefs.email_fallback_only,
    });
  }, [emailPrefsResult]);

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

  const [stravaSyncing, setStravaSyncing] = useState(false);
  const stravaDistanceM = (profile as any)?.strava_distance_m != null ? Number((profile as any).strava_distance_m) : null;
  const stravaMovingTimeS = (profile as any)?.strava_moving_time_s != null ? Number((profile as any).strava_moving_time_s) : null;
  const stravaKm = stravaDistanceM != null ? Math.round((stravaDistanceM / 1000) * 10) / 10 : null;
  const stravaMinutes = stravaMovingTimeS != null ? Math.round(stravaMovingTimeS / 60) : null;
  const privacyVisibleCount = Object.values(privacy).filter(Boolean).length;
  const emailEnabledCount = Object.values(emailPrefs).filter(Boolean).length;

  const getStravaAuth = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("You must be logged in");
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()?.replace(/\/+$/, "");
    const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();
    if (!supabaseUrl || !supabaseKey) throw new Error("Missing configuration");
    return { accessToken, supabaseUrl, supabaseKey };
  };

  const stravaSync = async () => {
    const { accessToken, supabaseUrl, supabaseKey } = await getStravaAuth();
    const res = await fetch(`${supabaseUrl}/functions/v1/strava`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: supabaseKey, Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ action: "sync" }),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload?.error || "Strava sync failed");
    return payload;
  };

  const connectStrava = async () => {
    const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID as string | undefined;
    if (!clientId) {
      toast.error("Missing Strava config");
      return;
    }
    const state = crypto.randomUUID();
    sessionStorage.setItem("strava_oauth_state", state);
    const webBase = getPublicWebBaseUrl();
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
  };

  const { linkedMembers, allMembers, isAdmin: isMemberAdmin, activeMember, isViewingAs, switchMember, resetToSelf } = useMemberContext();
  const showFamilySwitcher = linkedMembers.length > 1;
  const [memberSearch, setMemberSearch] = useState("");

  // For admin "view as" — filter all members by search
  const filteredAllMembers = allMembers.filter(m => {
    if (!memberSearch) return true;
    const q = memberSearch.toLowerCase();
    return (m.name || "").toLowerCase().includes(q) || (m.club_member_number || "").toLowerCase().includes(q) || (m.email || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold font-heading">Account & Settings</h2>
        {canOpenAdmin && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate("/admin")}>
            Admin <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        )}
      </div>

      {/* ── Viewing-as banner ── */}
      {isViewingAs && activeMember && (
        <Card className="p-3 border-primary/50 bg-primary/5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-primary" />
            <span>Viewing as <strong>{activeMember.name || activeMember.club_member_number || "Member"}</strong></span>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={resetToSelf}>
            Back to my profile
          </Button>
        </Card>
      )}

      {/* ── Family member switcher (shared email) ── */}
      {showFamilySwitcher && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="w-4 h-4 text-primary" />
            <span>Switch Member</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Multiple members are linked to your email:</p>
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
                {m.club_member_number ? ` (#${m.club_member_number})` : ""}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* ── Admin: View as any player ── */}
      {isMemberAdmin && allMembers.length > 0 && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Shield className="w-4 h-4 text-primary" />
            <span>View as Player</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Switch to any member's profile to view their dashboard.</p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              placeholder="Search members..."
              className="pl-8 h-8 text-xs"
            />
          </div>
          {memberSearch && (
            <div className="max-h-40 overflow-y-auto space-y-1">
              {filteredAllMembers.slice(0, 20).map(m => (
                <button
                  key={m.id}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/50 transition-colors flex items-center justify-between ${activeMember?.id === m.id ? "bg-primary/10 font-medium" : ""}`}
                  onClick={() => { switchMember(m.id); setMemberSearch(""); }}
                >
                  <span className="truncate">{m.name || "—"}</span>
                  <span className="text-muted-foreground shrink-0 ml-2">{m.club_member_number ? `#${m.club_member_number}` : m.email || ""}</span>
                </button>
              ))}
              {filteredAllMembers.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No members found</p>}
              {filteredAllMembers.length > 20 && <p className="text-[10px] text-muted-foreground text-center">Type more to narrow results…</p>}
            </div>
          )}
        </Card>
      )}

      <Card className="p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">Theme</p>
            <p className="text-[11px] text-muted-foreground">Light / dark</p>
          </div>
        </div>
        <ThemeToggle />
      </Card>





      {/* Push notifications */}
      {permission !== "unsupported" && (
        <Card className="p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
            <Bell className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Push notifications</p>
            <p className="text-[11px] text-muted-foreground">
              {permission === "denied" ? "Blocked in browser settings" : "Challenges & updates"}
            </p>
          </div>
          <Switch
            checked={isSubscribed}
            disabled={pushLoading || permission === "denied"}
            onCheckedChange={(checked) => (checked ? subscribe() : unsubscribe())}
          />
        </Card>
      )}

      {/* Integrations / Training */}
      <Card className="p-3 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
            <Flame className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Strava</p>
            <p className="text-[11px] text-muted-foreground">
              {strava ? "Connected" : "Not connected"}
            </p>
          </div>
          {strava ? (
            <Badge variant="secondary" className="text-[10px]">Connected</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">Optional</Badge>
          )}
        </div>

        {strava ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Card className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Distance</p>
                <p className="text-lg font-bold font-heading mt-1">{stravaKm != null ? `${stravaKm} km` : "—"}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Time</p>
                <p className="text-lg font-bold font-heading mt-1">{stravaMinutes != null ? `${stravaMinutes} min` : "—"}</p>
              </Card>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={stravaSyncing}
              onClick={async () => {
                try {
                  setStravaSyncing(true);
                  await stravaSync();
                  await queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
                  await queryClient.invalidateQueries({ queryKey: ["integrations"] });
                  toast.success("Strava synced");
                } catch (e: any) {
                  toast.error(e?.message || "Sync failed");
                } finally {
                  setStravaSyncing(false);
                }
              }}
            >
              {stravaSyncing ? "Syncing…" : "Sync Strava"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <IntegrationLogo provider="strava" className="opacity-40 grayscale shrink-0" />
            <Button size="sm" className="ml-auto" onClick={connectStrava}>
              Connect Strava
            </Button>
          </div>
        )}
      </Card>


    </div>
  );
}
