import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Link } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
const fromExt = (table: string) => (supabase as any).from(table);
const rpcExt: any = supabase.rpc.bind(supabase);
import { useAuth } from "@/contexts/AuthContext";
import { AppRole, useMyRoles } from "@/hooks/use-data";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type ProfileRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  rank: number | null;
  matches_played: number;
  wins: number;
  losses: number;
  created_at: string;
  updated_at: string;
  strava_connected?: boolean | null;
  strava_activities_count?: number | null;
  strava_distance_m?: number | string | null;
  strava_moving_time_s?: number | null;
  strava_elevation_m?: number | string | null;
  strava_last_sync_at?: string | null;
};

type ChallengeRow = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: "pending" | "accepted" | "declined" | "completed";
  proposed_date: string | null;
  created_at: string;
  updated_at: string;
};

type MatchRow = {
  id: string;
  player_a: string;
  player_b: string;
  score: string | null;
  winner_id: string | null;
  court_id: number | null;
  match_date: string;
  confirmed: boolean;
  disputed: boolean;
  challenge_id: string | null;
  created_at: string;
};

type ScheduledMatchRow = {
  id: string;
  booking_id: string | null;
  player_a: string;
  player_b: string;
  created_by: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  court_id: number | null;
  status: "scheduled" | "cancelled" | "completed";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type SeasonRow = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
};

type AdminEventRow = {
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
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_table: string;
  entity_id: string | null;
  summary: string | null;
  details: any;
  created_at: string;
};

type EditUserState = {
  open: boolean;
  profile: ProfileRow | null;
  rank: string;
  matchesPlayed: string;
  wins: string;
  losses: string;
};

type ScheduleState = {
  open: boolean;
  playerA: string;
  playerB: string;
  date: string;
  startTime: string;
  endTime: string;
  courtId: string;
  notes: string;
};

function toIntOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function escapeCsvValue(value: any) {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Array<Record<string, any>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((r) => headers.map((h) => escapeCsvValue(r[h])).join(",")),
  ];
  return lines.join("\n");
}

function downloadFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default function Admin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: myRoles } = useMyRoles();

  const isAdmin = (myRoles || []).includes("admin");
  const isManager = (myRoles || []).includes("moderator");

  const [userSearch, setUserSearch] = useState("");
  const [editUser, setEditUser] = useState<EditUserState>({
    open: false,
    profile: null,
    rank: "",
    matchesPlayed: "",
    wins: "",
    losses: "",
  });

  const [seasonStart, setSeasonStart] = useState<{ open: boolean; name: string; startsOn: string }>({
    open: false,
    name: "",
    startsOn: format(new Date(), "yyyy-MM-dd"),
  });

  const [seasonEnd, setSeasonEnd] = useState<{ open: boolean; resetStats: boolean; resetRanks: boolean }>({
    open: false,
    resetStats: true,
    resetRanks: false,
  });

  const [schedule, setSchedule] = useState<ScheduleState>(() => ({
    open: false,
    playerA: "",
    playerB: "",
    date: format(new Date(), "yyyy-MM-dd"),
    startTime: "18:00",
    endTime: "19:00",
    courtId: "1",
    notes: "",
  }));

  const [bulkRanksCsv, setBulkRanksCsv] = useState("");
  const [mergeUsers, setMergeUsers] = useState<{ sourceId: string; targetId: string }>({
    sourceId: "",
    targetId: "",
  });

  const [eventEdit, setEventEdit] = useState<{
    open: boolean;
    event: AdminEventRow | null;
    title: string;
    description: string;
    startsAtLocal: string;
    endsAtLocal: string;
    location: string;
    courtId: string;
    capacity: string;
    rsvpDeadlineLocal: string;
    visibility: "public" | "members";
    status: "draft" | "published" | "cancelled";
  }>({
    open: false,
    event: null,
    title: "",
    description: "",
    startsAtLocal: "",
    endsAtLocal: "",
    location: "",
    courtId: "",
    capacity: "",
    rsvpDeadlineLocal: "",
    visibility: "members",
    status: "draft",
  });

  const [broadcast, setBroadcast] = useState<{
    template: "custom" | "braai" | "club_night" | "tournament" | "maintenance";
    audience: "all" | "ranked" | "active30" | "strava" | "rsvp_event";
    eventId: string;
    title: string;
    message: string;
    url: string;
  }>({
    template: "custom",
    audience: "all",
    eventId: "",
    title: "",
    message: "",
    url: "/events",
  });

  const { data: profiles, isLoading: profilesLoading } = useQuery({
    queryKey: ["admin", "profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*");
      if (error) throw error;
      const rows = (data || []) as ProfileRow[];
      rows.sort((a, b) => {
        const ar = a.rank ?? 9999;
        const br = b.rank ?? 9999;
        if (ar !== br) return ar - br;
        return (a.name || "").localeCompare(b.name || "");
      });
      return rows;
    },
  });

  const profileMap = useMemo(() => {
    const map = new Map<string, ProfileRow>();
    for (const p of profiles || []) map.set(p.id, p);
    return map;
  }, [profiles]);

  const emailToIdMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profiles || []) {
      if (p.email) map.set(String(p.email).trim().toLowerCase(), p.id);
    }
    return map;
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return profiles || [];
    return (profiles || []).filter((p) => {
      const haystack = `${p.name || ""} ${p.email || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [profiles, userSearch]);

  const { data: challenges, isLoading: challengesLoading } = useQuery({
    queryKey: ["admin", "challenges"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("challenges")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return (data || []) as ChallengeRow[];
    },
  });

  const { data: matches, isLoading: matchesLoading } = useQuery({
    queryKey: ["admin", "matches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .order("match_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return (data || []) as MatchRow[];
    },
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["admin", "events"],
    queryFn: async () => {
      const { data, error } = await fromExt("events")
        .select("*")
        .order("starts_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as AdminEventRow[];
    },
    enabled: isAdmin || isManager,
  });

  const { data: rsvpAudienceUserIds } = useQuery({
    queryKey: ["admin", "event-rsvp-audience", broadcast.eventId],
    queryFn: async () => {
      if (!broadcast.eventId) return [] as string[];
      const { data, error } = await fromExt("event_rsvps")
        .select("user_id,status")
        .eq("event_id", broadcast.eventId)
        .in("status", ["going", "maybe"]);
      if (error) throw error;
      return [...new Set((data || []).map((r: any) => String(r.user_id)))];
    },
    enabled: (isAdmin || isManager) && broadcast.audience === "rsvp_event" && !!broadcast.eventId,
  });

  const { data: auditLog, isLoading: auditLoading } = useQuery({
    queryKey: ["admin", "audit-log"],
    queryFn: async () => {
      const { data, error } = await fromExt("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return (data || []) as unknown as AuditLogRow[];
    },
    enabled: isAdmin || isManager,
  });

  const { data: scheduledMatches, isLoading: scheduledLoading } = useQuery({
    queryKey: ["admin", "scheduled-matches"],
    queryFn: async () => {
      const { data, error } = await fromExt("scheduled_matches")
        .select("*")
        .order("scheduled_date", { ascending: false })
        .order("start_time", { ascending: false })
        .limit(250);
      if (error) throw error;
      return (data || []) as unknown as ScheduledMatchRow[];
    },
  });

  const { data: seasons } = useQuery({
    queryKey: ["admin", "seasons"],
    queryFn: async () => {
      const { data, error } = await fromExt("seasons")
        .select("*")
        .order("starts_on", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as SeasonRow[];
    },
  });

  const activeSeason = useMemo(() => (seasons || []).find((s) => s.is_active) || null, [seasons]);

  const setRank = useMutation({
    mutationFn: async ({ userId, newRank }: { userId: string; newRank: number | null }) => {
      const { error } = await rpcExt("admin_set_rank", {
        target_user_id: userId,
        new_rank: newRank,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      await queryClient.invalidateQueries({ queryKey: ["ladder"] });
      toast.success("Rank updated");
    },
    onError: (err: any) => toast.error(err.message || "Failed to update rank"),
  });

  const updateStats = useMutation({
    mutationFn: async ({ userId, patch }: { userId: string; patch: Partial<ProfileRow> }) => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      toast.success("Profile updated");
    },
    onError: (err: any) => toast.error(err.message || "Failed to update profile"),
  });

  const updateChallengeStatus = useMutation({
    mutationFn: async ({ challengeId, status }: { challengeId: string; status: ChallengeRow["status"] }) => {
      const { error } = await supabase.from("challenges").update({ status }).eq("id", challengeId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "challenges"] });
      await queryClient.invalidateQueries({ queryKey: ["challenges"] });
      toast.success("Challenge updated");
    },
    onError: (err: any) => toast.error(err.message || "Failed to update challenge"),
  });

  const updateMatch = useMutation({
    mutationFn: async ({ matchId, patch }: { matchId: string; patch: Partial<MatchRow> }) => {
      const { error } = await supabase.from("matches").update(patch).eq("id", matchId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      await queryClient.invalidateQueries({ queryKey: ["matches"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      await queryClient.invalidateQueries({ queryKey: ["ladder"] });
      toast.success("Match updated");
    },
    onError: (err: any) => toast.error(err.message || "Failed to update match"),
  });

  const adminConfirmMatch = useMutation({
    mutationFn: async (matchId: string) => {
      const { error } = await rpcExt("admin_confirm_match", { match_id: matchId });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      await queryClient.invalidateQueries({ queryKey: ["matches"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      await queryClient.invalidateQueries({ queryKey: ["ladder"] });
      toast.success("Match confirmed");
    },
    onError: (err: any) => toast.error(err.message || "Failed to confirm match"),
  });

  const mergeDuplicateUsers = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      if (!looksLikeUuid(sourceId) || !looksLikeUuid(targetId)) throw new Error("Select two users to merge");
      const { error } = await rpcExt("admin_merge_users", {
        source_user_id: sourceId,
        target_user_id: targetId,
      } as any);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "challenges"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "audit-log"] });
      await queryClient.invalidateQueries({ queryKey: ["ladder"] });
      toast.success("Users merged");
      setMergeUsers({ sourceId: "", targetId: "" });
    },
    onError: (err: any) => toast.error(err.message || "Failed to merge users"),
  });

  const bulkSetRanks = useMutation({
    mutationFn: async ({ assignments }: { assignments: Array<{ user_id: string; rank: number }> }) => {
      const { error } = await rpcExt("admin_bulk_set_ranks", { assignments });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "audit-log"] });
      await queryClient.invalidateQueries({ queryKey: ["ladder"] });
      toast.success("Ladder imported");
      setBulkRanksCsv("");
    },
    onError: (err: any) => toast.error(err.message || "Failed to import ladder"),
  });

  const saveEvent = useMutation({
    mutationFn: async (payload: {
      id?: string;
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
    }) => {
      const row: any = {
        ...(payload.id ? { id: payload.id } : {}),
        title: payload.title,
        description: payload.description,
        starts_at: payload.starts_at,
        ends_at: payload.ends_at,
        location: payload.location,
        court_id: payload.court_id,
        capacity: payload.capacity,
        rsvp_deadline: payload.rsvp_deadline,
        visibility: payload.visibility,
        status: payload.status,
        created_by: user?.id || null,
      };

      const { error } = await fromExt("events").upsert(row, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "events"] });
      toast.success("Event saved");
      setEventEdit((s) => ({ ...s, open: false, event: null }));
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save event"),
  });

  const sendBroadcast = useMutation({
    mutationFn: async (payload: { recipients: string[]; title: string; message: string; url: string; data?: any }) => {
      const title = payload.title.trim();
      const message = payload.message.trim();
      const url = payload.url.trim() || "/events";
      if (!title) throw new Error("Title is required");
      if (!message) throw new Error("Message is required");
      if (payload.recipients.length === 0) throw new Error("No recipients");

      // Batch inserts to avoid request size limits.
      const chunkSize = 200;
      for (let i = 0; i < payload.recipients.length; i += chunkSize) {
        const chunk = payload.recipients.slice(i, i + chunkSize);
        const rows = chunk.map((uid) => ({
          user_id: uid,
          title,
          message,
          type: "marketing",
          url,
          data: payload.data || {},
        }));
        const { error } = await supabase.from("notifications").insert(rows as any);
        if (error) throw error;
      }
    },
    onSuccess: () => toast.success("Broadcast sent"),
    onError: (e: any) => toast.error(e?.message || "Failed to send broadcast"),
  });

  const startSeason = useMutation({
    mutationFn: async ({ name, startsOn }: { name: string; startsOn: string }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Season name is required");
      const { error } = await rpcExt("admin_start_season", {
        season_name: trimmed,
        starts_on: startsOn,
      } as any);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "seasons"] });
      toast.success("Season started");
      setSeasonStart((s) => ({ ...s, open: false, name: "" }));
    },
    onError: (err: any) => toast.error(err.message || "Failed to start season"),
  });

  const endSeason = useMutation({
    mutationFn: async ({ resetStats, resetRanks }: { resetStats: boolean; resetRanks: boolean }) => {
      const { error } = await rpcExt("admin_end_active_season", {
        reset_stats: resetStats,
        reset_ranks: resetRanks,
      } as any);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "seasons"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      await queryClient.invalidateQueries({ queryKey: ["ladder"] });
      toast.success("Season ended");
      setSeasonEnd((s) => ({ ...s, open: false }));
    },
    onError: (err: any) => toast.error(err.message || "Failed to end season"),
  });

  const { data: selectedRoles } = useQuery({
    queryKey: ["admin", "user-roles", editUser.profile?.id],
    queryFn: async () => {
      if (!editUser.profile?.id) return [] as AppRole[];
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", editUser.profile.id);
      if (error) throw error;
      return (data || []).map((r) => r.role) as AppRole[];
    },
    enabled: !!editUser.profile?.id,
  });

  const setUserRole = useMutation({
    mutationFn: async ({ userId, role, enabled }: { userId: string; role: AppRole; enabled: boolean }) => {
      if (enabled) {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "user-roles"] });
      await queryClient.invalidateQueries({ queryKey: ["my-roles"] });
      toast.success("Roles updated");
    },
    onError: (err: any) => toast.error(err.message || "Failed to update roles"),
  });

  const createSchedule = useMutation({
    mutationFn: async (payload: {
      playerA: string;
      playerB: string;
      date: string;
      startTime: string;
      endTime: string;
      courtId: number;
      notes: string | null;
    }) => {
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          court_id: payload.courtId,
          user_id: payload.playerA,
          date: payload.date,
          start_time: payload.startTime,
          end_time: payload.endTime,
          status: "active",
        })
        .select()
        .single();
      if (bookingError) throw bookingError;

      const { data: scheduled, error: scheduledError } = await fromExt("scheduled_matches")
        .insert({
          booking_id: booking.id,
          player_a: payload.playerA,
          player_b: payload.playerB,
          created_by: user?.id ?? null,
          scheduled_date: payload.date,
          start_time: payload.startTime,
          end_time: payload.endTime,
          court_id: payload.courtId,
          status: "scheduled",
          notes: payload.notes,
        })
        .select()
        .single();
      if (scheduledError) throw scheduledError;

      const playerAName = profileMap.get(payload.playerA)?.name || "Player A";
      const playerBName = profileMap.get(payload.playerB)?.name || "Player B";
      const message = `Scheduled match: ${playerAName} vs ${playerBName} on ${payload.date} at ${payload.startTime} (Court ${payload.courtId}).`;

      await supabase.from("notifications").insert([
        { user_id: payload.playerA, title: "Match scheduled", message, type: "match" },
        { user_id: payload.playerB, title: "Match scheduled", message, type: "match" },
      ]);

      return scheduled;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "scheduled-matches"] });
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Match scheduled");
      setSchedule((s) => ({ ...s, open: false }));
    },
    onError: (err: any) => {
      if (err?.code === "23505") {
        toast.error("That slot is already booked");
        return;
      }
      toast.error(err.message || "Failed to schedule match");
    },
  });

  const cancelSchedule = useMutation({
    mutationFn: async ({ scheduleId, bookingId }: { scheduleId: string; bookingId: string | null }) => {
      const { error: schedError } = await supabase
        .from("scheduled_matches")
        .update({ status: "cancelled" })
        .eq("id", scheduleId);
      if (schedError) throw schedError;

      if (bookingId) {
        const { error: bookingError } = await supabase
          .from("bookings")
          .update({ status: "cancelled" })
          .eq("id", bookingId);
        if (bookingError) throw bookingError;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "scheduled-matches"] });
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Schedule cancelled");
    },
    onError: (err: any) => toast.error(err.message || "Failed to cancel schedule"),
  });

  const openEdit = (p: ProfileRow) => {
    setEditUser({
      open: true,
      profile: p,
      rank: p.rank != null ? String(p.rank) : "",
      matchesPlayed: String(p.matches_played ?? 0),
      wins: String(p.wins ?? 0),
      losses: String(p.losses ?? 0),
    });
  };

  const toLocalInput = (iso: string | null) => {
    if (!iso) return "";
    try {
      return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
    } catch {
      return "";
    }
  };

  const openEventEditor = (e?: AdminEventRow | null) => {
    const ev = e || null;
    setEventEdit({
      open: true,
      event: ev,
      title: ev?.title || "",
      description: ev?.description || "",
      startsAtLocal: toLocalInput(ev?.starts_at || null) || format(new Date(), "yyyy-MM-dd'T'18:00"),
      endsAtLocal: toLocalInput(ev?.ends_at || null),
      location: ev?.location || "",
      courtId: ev?.court_id != null ? String(ev.court_id) : "",
      capacity: ev?.capacity != null ? String(ev.capacity) : "",
      rsvpDeadlineLocal: toLocalInput(ev?.rsvp_deadline || null),
      visibility: ev?.visibility || "members",
      status: ev?.status || "draft",
    });
  };

  const selected = editUser.profile;
  const selectedRoleSet = new Set<AppRole>(selectedRoles || []);

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Admin" subtitle="Manage players, challenges, matches & schedules" />

      <div className="px-4 sm:px-6 lg:px-[5%] mt-3">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold font-heading">Access</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAdmin ? "Admin" : isManager ? "Manager" : "—"}
              </p>
            </div>
            <div className="flex gap-2">
              {isAdmin && <Badge variant="secondary">Admin</Badge>}
              {isManager && <Badge variant="secondary">Manager</Badge>}
            </div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="users" className="px-4 sm:px-6 lg:px-[5%] mt-3">
        <TabsList className="w-full">
          <TabsTrigger value="users" className="flex-1">Users</TabsTrigger>
          <TabsTrigger value="challenges" className="flex-1">Challenges</TabsTrigger>
          <TabsTrigger value="matches" className="flex-1">Matches</TabsTrigger>
          <TabsTrigger value="schedule" className="flex-1">Schedule</TabsTrigger>
          <TabsTrigger value="seasons" className="flex-1">Seasons</TabsTrigger>
          <TabsTrigger value="clubops" className="flex-1">Club Ops</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-3 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Search name or email…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
          </div>

          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Player</TableHead>
                  <TableHead className="w-[14%]">Rank</TableHead>
                  <TableHead className="w-[18%]">W/L</TableHead>
                  <TableHead className="w-[18%]">Strava</TableHead>
                  <TableHead className="w-[10%] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profilesLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : filteredProfiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      No users found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProfiles.map((p) => {
                    const isMe = p.id === user?.id;
                    const stravaConnected = !!(p as any).strava_connected;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{p.name || "—"}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {p.email || "—"}
                              {isMe ? " (you)" : ""}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="p-3">
                          {p.rank != null ? (
                            <Badge variant="secondary">#{p.rank}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="p-3">
                          <span className="text-sm tabular-nums">
                            {p.wins}-{p.losses}
                          </span>
                          <span className="text-[11px] text-muted-foreground ml-2">
                            ({p.matches_played})
                          </span>
                        </TableCell>
                        <TableCell className="p-3">
                          <span className={cn("text-xs", stravaConnected ? "text-foreground" : "text-muted-foreground")}>
                            {stravaConnected ? "Connected" : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="p-3 text-right">
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openEdit(p)}>
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="challenges" className="mt-3 space-y-2">
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Challenger</TableHead>
                  <TableHead>Opponent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Update</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {challengesLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : (challenges || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      No challenges.
                    </TableCell>
                  </TableRow>
                ) : (
                  (challenges || []).map((c) => {
                    const challenger = profileMap.get(c.challenger_id)?.name || "Unknown";
                    const opponent = profileMap.get(c.opponent_id)?.name || "Unknown";
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="p-3 text-xs text-muted-foreground">
                          {format(new Date(c.created_at), "yyyy-MM-dd")}
                        </TableCell>
                        <TableCell className="p-3 text-sm">{challenger}</TableCell>
                        <TableCell className="p-3 text-sm">{opponent}</TableCell>
                        <TableCell className="p-3">
                          <Badge variant="secondary" className="capitalize">
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-3 text-right">
                          <Select
                            value={c.status}
                            onValueChange={(value) =>
                              updateChallengeStatus.mutate({ challengeId: c.id, status: value as ChallengeRow["status"] })
                            }
                          >
                            <SelectTrigger className="h-8 w-[140px] ml-auto">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">pending</SelectItem>
                              <SelectItem value="accepted">accepted</SelectItem>
                              <SelectItem value="declined">declined</SelectItem>
                              <SelectItem value="completed">completed</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="matches" className="mt-3 space-y-2">
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Players</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Winner</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="text-right">Update</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matchesLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : (matches || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-muted-foreground">
                      No matches.
                    </TableCell>
                  </TableRow>
                ) : (
                  (matches || []).map((m) => {
                    const aName = profileMap.get(m.player_a)?.name || "Unknown";
                    const bName = profileMap.get(m.player_b)?.name || "Unknown";
                    const winnerName =
                      m.winner_id === m.player_a ? aName : m.winner_id === m.player_b ? bName : "—";

                    return (
                      <TableRow key={m.id}>
                        <TableCell className="p-3 text-xs text-muted-foreground">{m.match_date}</TableCell>
                        <TableCell className="p-3 text-sm">
                          <div className="min-w-0">
                            <p className="truncate">{aName} vs {bName}</p>
                            {m.challenge_id && (
                              <p className="text-[11px] text-muted-foreground truncate">
                                Challenge linked
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="p-3 text-sm">{m.score || "—"}</TableCell>
                        <TableCell className="p-3 text-sm">{winnerName}</TableCell>
                        <TableCell className="p-3">
                          <div className="flex gap-2">
                            {m.confirmed && <Badge variant="secondary">Confirmed</Badge>}
                            {m.disputed && <Badge variant="secondary" className="bg-destructive/15 text-destructive">Disputed</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="p-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={() =>
                                updateMatch.mutate({
                                  matchId: m.id,
                                  patch: { disputed: !m.disputed, ...(m.disputed ? {} : {}) },
                                })
                              }
                            >
                              {m.disputed ? "Undispute" : "Dispute"}
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              disabled={m.confirmed}
                              onClick={() => adminConfirmMatch.mutate(m.id)}
                            >
                              Confirm
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="mt-3 space-y-3">
          <div className="flex gap-2">
            <Button className="w-full sm:w-auto" onClick={() => setSchedule((s) => ({ ...s, open: true }))}>
              New scheduled match
            </Button>
          </div>

          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Players</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduledLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : (scheduledMatches || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      No scheduled matches.
                    </TableCell>
                  </TableRow>
                ) : (
                  (scheduledMatches || []).map((s) => {
                    const aName = profileMap.get(s.player_a)?.name || "Unknown";
                    const bName = profileMap.get(s.player_b)?.name || "Unknown";
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="p-3 text-xs text-muted-foreground">
                          {s.scheduled_date}
                        </TableCell>
                        <TableCell className="p-3 text-xs">
                          {s.start_time}–{s.end_time}{" "}
                          <span className="text-muted-foreground">
                            (Court {s.court_id || "—"})
                          </span>
                        </TableCell>
                        <TableCell className="p-3 text-sm">
                          <div className="min-w-0">
                            <p className="truncate">{aName} vs {bName}</p>
                            {s.notes && <p className="text-[11px] text-muted-foreground truncate">{s.notes}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="p-3">
                          <Badge variant="secondary" className="capitalize">
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              asChild
                            >
                              <Link to={`/players/${s.player_a}`}>View A</Link>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              asChild
                            >
                              <Link to={`/players/${s.player_b}`}>View B</Link>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              disabled={s.status === "cancelled"}
                              onClick={() => cancelSchedule.mutate({ scheduleId: s.id, bookingId: s.booking_id })}
                            >
                              Cancel
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="seasons" className="mt-3 space-y-3">
          <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold font-heading">Active season</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {activeSeason
                    ? `${activeSeason.name} · ${activeSeason.starts_on}${activeSeason.ends_on ? ` → ${activeSeason.ends_on}` : ""}`
                    : "No active season"}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setSeasonStart((s) => ({ ...s, open: true }))}
                >
                  Start season
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!activeSeason}
                  onClick={() => setSeasonEnd((s) => ({ ...s, open: true }))}
                >
                  End season
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(seasons || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-sm text-muted-foreground">
                      No seasons yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  (seasons || []).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="p-3 text-sm">
                        <span className="font-medium">{s.name}</span>
                      </TableCell>
                      <TableCell className="p-3 text-xs text-muted-foreground">{s.starts_on}</TableCell>
                      <TableCell className="p-3 text-xs text-muted-foreground">{s.ends_on || "—"}</TableCell>
                      <TableCell className="p-3">
                        {s.is_active ? (
                          <Badge variant="secondary" className="bg-primary/15 text-primary">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Ended</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="clubops" className="mt-3 space-y-3">
          <Card className="p-4">
            <p className="text-sm font-semibold font-heading">Bulk actions</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Import ladder ranks in bulk, or export CSV for reporting.
            </p>

            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">Import ladder (CSV)</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Paste lines as <span className="font-mono">email,rank</span> or <span className="font-mono">user_id,rank</span>.
                  This clears all existing ranks first.
                </p>
                <Textarea
                  value={bulkRanksCsv}
                  onChange={(e) => setBulkRanksCsv(e.target.value)}
                  placeholder={`email,rank\nplayer1@example.com,1\nplayer2@example.com,2`}
                  className="mt-2 min-h-[120px] text-xs"
                />
                <div className="mt-2 flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={!isAdmin || bulkSetRanks.isPending}
                    onClick={() => {
                      try {
                        const lines = bulkRanksCsv
                          .split(/\r?\n/)
                          .map((l) => l.trim())
                          .filter(Boolean)
                          .filter((l) => !/^email\s*,\s*rank/i.test(l) && !/^user_id\s*,\s*rank/i.test(l));

                        const assignments: Array<{ user_id: string; rank: number }> = [];
                        const seen = new Set<number>();

                        for (const line of lines) {
                          const parts = line.split(/[,\t;]+/).map((p) => p.trim()).filter(Boolean);
                          if (parts.length < 2) throw new Error(`Bad line: ${line}`);
                          const key = parts[0];
                          const rank = Number(parts[1]);
                          if (!Number.isFinite(rank)) throw new Error(`Invalid rank on line: ${line}`);
                          const r = Math.trunc(rank);
                          if (r < 1 || r > 20) throw new Error(`Rank must be 1-20 on line: ${line}`);
                          if (seen.has(r)) throw new Error(`Duplicate rank ${r} in import`);
                          seen.add(r);

                          let userId: string | null = null;
                          if (looksLikeUuid(key)) userId = key;
                          else userId = emailToIdMap.get(key.toLowerCase()) || null;
                          if (!userId) throw new Error(`Unknown user: ${key}`);

                          assignments.push({ user_id: userId, rank: r });
                        }

                        if (assignments.length === 0) throw new Error("No assignments found");
                        bulkSetRanks.mutate({ assignments });
                      } catch (e: any) {
                        toast.error(e?.message || "Invalid CSV");
                      }
                    }}
                  >
                    Import ranks
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-8 text-xs"
                    onClick={() => {
                      const ladderRows = (profiles || [])
                        .filter((p) => p.rank != null)
                        .slice()
                        .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
                        .map((p) => ({
                          rank: p.rank ?? "",
                          name: p.name || "",
                          email: p.email || "",
                          matches_played: p.matches_played ?? 0,
                          wins: p.wins ?? 0,
                          losses: p.losses ?? 0,
                        }));
                      downloadFile(`ladder-${format(new Date(), "yyyy-MM-dd")}.csv`, toCsv(ladderRows));
                    }}
                  >
                    Export ladder CSV
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-8 text-xs"
                    onClick={() => {
                      const matchRows = (matches || []).map((m) => ({
                        match_date: m.match_date,
                        player_a: profileMap.get(m.player_a)?.name || m.player_a,
                        player_b: profileMap.get(m.player_b)?.name || m.player_b,
                        score: m.score || "",
                        winner: m.winner_id ? (profileMap.get(m.winner_id)?.name || m.winner_id) : "",
                        confirmed: m.confirmed,
                        disputed: m.disputed,
                        challenge_id: m.challenge_id || "",
                      }));
                      downloadFile(`matches-${format(new Date(), "yyyy-MM-dd")}.csv`, toCsv(matchRows));
                    }}
                  >
                    Export matches CSV
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">Merge duplicate users</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Moves public app data from the source user into the target user, then marks the source profile as merged (unranked).
                </p>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Source user (to merge)</Label>
                    <Select value={mergeUsers.sourceId} onValueChange={(v) => setMergeUsers((s) => ({ ...s, sourceId: v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select user…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(profiles || []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name || "—"} {p.email ? `(${p.email})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Target user (keep)</Label>
                    <Select value={mergeUsers.targetId} onValueChange={(v) => setMergeUsers((s) => ({ ...s, targetId: v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select user…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(profiles || []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name || "—"} {p.email ? `(${p.email})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-2">
                  <Button
                    className="h-8 text-xs"
                    disabled={!isAdmin || mergeDuplicateUsers.isPending}
                    onClick={() => mergeDuplicateUsers.mutate({ sourceId: mergeUsers.sourceId, targetId: mergeUsers.targetId })}
                  >
                    Merge users
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold font-heading">Events</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Create club events and let players RSVP.
                </p>
              </div>
              <Button size="sm" className="h-8 text-xs shrink-0" onClick={() => openEventEditor(null)}>
                New event
              </Button>
            </div>

            <div className="mt-3 space-y-2">
              {eventsLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : !events || events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events yet.</p>
              ) : (
                events.slice(0, 10).map((e) => {
                  const starts = e.starts_at ? format(new Date(e.starts_at), "d MMM yyyy HH:mm") : "—";
                  return (
                    <div key={e.id} className="rounded-lg border p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{e.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {starts} · {e.visibility} · {e.status}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={e.status}
                          onValueChange={(value) => {
                            saveEvent.mutate({
                              id: e.id,
                              title: e.title,
                              description: e.description || null,
                              starts_at: e.starts_at,
                              ends_at: e.ends_at || null,
                              location: e.location || null,
                              court_id: e.court_id ?? null,
                              capacity: e.capacity ?? null,
                              rsvp_deadline: e.rsvp_deadline || null,
                              visibility: e.visibility,
                              status: value as any,
                            });
                          }}
                        >
                          <SelectTrigger className="h-8 w-[130px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">draft</SelectItem>
                            <SelectItem value="published">published</SelectItem>
                            <SelectItem value="cancelled">cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openEventEditor(e)}>
                          Edit
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-sm font-semibold font-heading">Broadcast (Marketing)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sends an in-app notification to a selected audience. Push delivery happens automatically for users with push enabled.
            </p>

            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Template</Label>
                    <Select
                      value={broadcast.template}
                      onValueChange={(value) => {
                        const v = value as any;
                        const templates: Record<string, { title: string; message: string; url: string }> = {
                          braai: {
                            title: "Braai Social",
                            message: "Friendly braai + social matches. RSVP in Events!",
                            url: "/events",
                          },
                          club_night: {
                            title: "Club Night",
                            message: "Club night matches are on. Book a court and get a game in!",
                            url: "/bookings",
                          },
                          tournament: {
                            title: "Tournament",
                            message: "Tournament coming up! Check Events for details and RSVP.",
                            url: "/events",
                          },
                          maintenance: {
                            title: "Maintenance",
                            message: "Courts will be unavailable during maintenance. See Events for timing.",
                            url: "/events",
                          },
                        };
                        const t = templates[v];
                        setBroadcast((s) => ({
                          ...s,
                          template: v,
                          ...(t ? { title: t.title, message: t.message, url: t.url } : {}),
                        }));
                      }}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">Custom</SelectItem>
                        <SelectItem value="braai">Braai social</SelectItem>
                        <SelectItem value="club_night">Club night</SelectItem>
                        <SelectItem value="tournament">Tournament</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Audience</Label>
                    <Select value={broadcast.audience} onValueChange={(value) => setBroadcast((s) => ({ ...s, audience: value as any }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All members</SelectItem>
                        <SelectItem value="ranked">Ranked only</SelectItem>
                        <SelectItem value="active30">Active last 30d</SelectItem>
                        <SelectItem value="strava">Strava-connected</SelectItem>
                        <SelectItem value="rsvp_event">RSVPed to event</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {broadcast.audience === "rsvp_event" ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Event</Label>
                    <Select value={broadcast.eventId} onValueChange={(value) => setBroadcast((s) => ({ ...s, eventId: value }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select event…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(events || []).map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label className="text-xs">Title</Label>
                  <Input value={broadcast.title} onChange={(e) => setBroadcast((s) => ({ ...s, title: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Message</Label>
                  <Textarea
                    value={broadcast.message}
                    onChange={(e) => setBroadcast((s) => ({ ...s, message: e.target.value }))}
                    className="min-h-[90px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Link URL</Label>
                  <Input value={broadcast.url} onChange={(e) => setBroadcast((s) => ({ ...s, url: e.target.value }))} placeholder="/events" />
                  <p className="text-[11px] text-muted-foreground">
                    Example: <span className="font-mono">/events</span> or <span className="font-mono">/events/&lt;id&gt;</span>
                  </p>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">Preview</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Recipients are calculated from your selected audience filter.
                </p>

                {(() => {
                  const allIds = (profiles || []).map((p) => p.id);
                  let ids: string[] = [];
                  if (broadcast.audience === "all") ids = allIds;
                  if (broadcast.audience === "ranked") ids = (profiles || []).filter((p) => p.rank != null).map((p) => p.id);
                  if (broadcast.audience === "active30") {
                    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
                    ids = (profiles || [])
                      .filter((p) => {
                        const last = (p as any).last_competitive_match_at as string | null | undefined;
                        if (!last) return false;
                        return new Date(last).getTime() >= cutoff;
                      })
                      .map((p) => p.id);
                  }
                  if (broadcast.audience === "strava") ids = (profiles || []).filter((p) => !!(p as any).strava_connected).map((p) => p.id);
                  if (broadcast.audience === "rsvp_event") ids = rsvpAudienceUserIds || [];

                  const count = ids.length;
                  return (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Recipients</span>
                        <span className="font-medium">{count}</span>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs font-semibold">{broadcast.title || "—"}</p>
                        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">
                          {broadcast.message || "—"}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-2">
                          Link: <span className="font-mono">{broadcast.url || "/events"}</span>
                        </p>
                      </div>
                      <Button
                        className="w-full h-9 text-xs"
                        disabled={!isAdmin && !isManager ? true : sendBroadcast.isPending || count === 0}
                        onClick={() => {
                          sendBroadcast.mutate({
                            recipients: ids,
                            title: broadcast.title,
                            message: broadcast.message,
                            url: broadcast.url,
                            data: {
                              kind: "broadcast",
                              template: broadcast.template,
                              ...(broadcast.audience === "rsvp_event" && broadcast.eventId ? { event_id: broadcast.eventId } : {}),
                            },
                          });
                        }}
                      >
                        {sendBroadcast.isPending ? "Sending…" : "Send broadcast"}
                      </Button>
                    </div>
                  );
                })()}
              </div>
            </div>
          </Card>

          <Card className="p-0">
            <div className="p-4 pb-2">
              <p className="text-sm font-semibold font-heading">Audit log</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tracks rank changes, match updates, and booking cancellations.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[18%]">Time</TableHead>
                  <TableHead className="w-[18%]">Actor</TableHead>
                  <TableHead className="w-[16%]">Action</TableHead>
                  <TableHead className="w-[18%]">Entity</TableHead>
                  <TableHead className="w-[30%]">Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : (auditLog || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      No audit entries yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  (auditLog || []).map((row) => {
                    const actorName = row.actor_id ? (profileMap.get(row.actor_id)?.name || row.actor_id) : "System";
                    const actorEmail = row.actor_id ? (profileMap.get(row.actor_id)?.email || null) : null;
                    const when = row.created_at ? format(new Date(row.created_at), "yyyy-MM-dd HH:mm") : "—";
                    const entity = `${row.entity_table}${row.entity_id ? `:${row.entity_id.slice(0, 8)}` : ""}`;
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="p-3 text-xs text-muted-foreground">{when}</TableCell>
                        <TableCell className="p-3">
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{actorName}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{actorEmail || "—"}</p>
                          </div>
                        </TableCell>
                        <TableCell className="p-3 text-xs">
                          <Badge variant="secondary" className="capitalize">
                            {row.action.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-3 text-xs text-muted-foreground">{entity}</TableCell>
                        <TableCell className="p-3 text-xs">
                          <span className="text-muted-foreground">{row.summary || "—"}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={eventEdit.open} onOpenChange={(open) => setEventEdit((s) => ({ ...s, open }))}>
        <DialogContent className="flex flex-col max-h-[90vh] overflow-hidden p-0 gap-0">
          <div className="p-6 pb-4 border-b">
            <DialogHeader>
              <DialogTitle>{eventEdit.event ? "Edit event" : "New event"}</DialogTitle>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={eventEdit.title} onChange={(e) => setEventEdit((s) => ({ ...s, title: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={eventEdit.description}
                onChange={(e) => setEventEdit((s) => ({ ...s, description: e.target.value }))}
                className="min-h-[120px]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Starts</Label>
                <Input
                  type="datetime-local"
                  value={eventEdit.startsAtLocal}
                  onChange={(e) => setEventEdit((s) => ({ ...s, startsAtLocal: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ends (optional)</Label>
                <Input
                  type="datetime-local"
                  value={eventEdit.endsAtLocal}
                  onChange={(e) => setEventEdit((s) => ({ ...s, endsAtLocal: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Location (optional)</Label>
                <Input value={eventEdit.location} onChange={(e) => setEventEdit((s) => ({ ...s, location: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Court (optional)</Label>
                <Select value={eventEdit.courtId} onValueChange={(v) => setEventEdit((s) => ({ ...s, courtId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select court" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">—</SelectItem>
                    <SelectItem value="1">Court 1</SelectItem>
                    <SelectItem value="2">Court 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Capacity (optional)</Label>
                <Input
                  inputMode="numeric"
                  value={eventEdit.capacity}
                  onChange={(e) => setEventEdit((s) => ({ ...s, capacity: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>RSVP deadline (optional)</Label>
                <Input
                  type="datetime-local"
                  value={eventEdit.rsvpDeadlineLocal}
                  onChange={(e) => setEventEdit((s) => ({ ...s, rsvpDeadlineLocal: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Visibility</Label>
                <Select value={eventEdit.visibility} onValueChange={(v) => setEventEdit((s) => ({ ...s, visibility: v as any }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="members">Members</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={eventEdit.status} onValueChange={(v) => setEventEdit((s) => ({ ...s, status: v as any }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">draft</SelectItem>
                  <SelectItem value="published">published</SelectItem>
                  <SelectItem value="cancelled">cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="p-6 pt-4 border-t bg-background">
            <DialogFooter>
              <Button variant="outline" onClick={() => setEventEdit((s) => ({ ...s, open: false, event: null }))}>
                Cancel
              </Button>
              <Button
                disabled={saveEvent.isPending}
                onClick={() => {
                  try {
                    const title = eventEdit.title.trim();
                    if (!title) throw new Error("Title is required");
                    if (!eventEdit.startsAtLocal.trim()) throw new Error("Start time is required");

                    const startsAtIso = new Date(eventEdit.startsAtLocal).toISOString();
                    const endsAtIso = eventEdit.endsAtLocal.trim() ? new Date(eventEdit.endsAtLocal).toISOString() : null;
                    const deadlineIso = eventEdit.rsvpDeadlineLocal.trim() ? new Date(eventEdit.rsvpDeadlineLocal).toISOString() : null;
                    const cap = eventEdit.capacity.trim() ? Number(eventEdit.capacity) : null;
                    if (cap != null && (!Number.isFinite(cap) || cap < 1 || cap > 5000)) {
                      throw new Error("Capacity must be between 1 and 5000");
                    }

                    saveEvent.mutate({
                      id: eventEdit.event?.id,
                      title,
                      description: eventEdit.description.trim() || null,
                      starts_at: startsAtIso,
                      ends_at: endsAtIso,
                      location: eventEdit.location.trim() || null,
                      court_id: eventEdit.courtId ? Number(eventEdit.courtId) : null,
                      capacity: cap == null ? null : Math.trunc(cap),
                      rsvp_deadline: deadlineIso,
                      visibility: eventEdit.visibility,
                      status: eventEdit.status,
                    });
                  } catch (e: any) {
                    toast.error(e?.message || "Invalid event");
                  }
                }}
              >
                {saveEvent.isPending ? "Saving…" : "Save event"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={seasonStart.open}
        onOpenChange={(open) => setSeasonStart((s) => ({ ...s, open }))}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Start new season</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                placeholder="e.g. Winter 2026"
                value={seasonStart.name}
                onChange={(e) => setSeasonStart((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input
                type="date"
                value={seasonStart.startsOn}
                onChange={(e) => setSeasonStart((s) => ({ ...s, startsOn: e.target.value }))}
              />
            </div>
            {activeSeason && (
              <p className="text-[11px] text-muted-foreground">
                Starting a new season will end the current active season automatically.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeasonStart((s) => ({ ...s, open: false }))}>
              Cancel
            </Button>
            <Button
              onClick={() => startSeason.mutate({ name: seasonStart.name, startsOn: seasonStart.startsOn })}
              disabled={startSeason.isPending}
            >
              {startSeason.isPending ? "Starting..." : "Start"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={seasonEnd.open}
        onOpenChange={(open) => setSeasonEnd((s) => ({ ...s, open }))}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>End active season</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">{activeSeason?.name || "Active season"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                This will archive the current ladder + stats into a season snapshot.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Reset stats</p>
                <p className="text-xs text-muted-foreground">Set W/L/played back to 0</p>
              </div>
              <Switch
                checked={seasonEnd.resetStats}
                onCheckedChange={(checked) => setSeasonEnd((s) => ({ ...s, resetStats: checked }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Reset ladder ranks</p>
                <p className="text-xs text-muted-foreground">Clear ranks (set to unranked)</p>
              </div>
              <Switch
                checked={seasonEnd.resetRanks}
                onCheckedChange={(checked) => setSeasonEnd((s) => ({ ...s, resetRanks: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeasonEnd((s) => ({ ...s, open: false }))}>
              Cancel
            </Button>
            <Button
              onClick={() => endSeason.mutate({ resetStats: seasonEnd.resetStats, resetRanks: seasonEnd.resetRanks })}
              disabled={endSeason.isPending || !activeSeason}
            >
              {endSeason.isPending ? "Ending..." : "End season"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editUser.open} onOpenChange={(open) => setEditUser((s) => ({ ...s, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User</DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="rounded-md border p-3">
                <p className="text-sm font-medium">{selected.name || "—"}</p>
                <p className="text-xs text-muted-foreground">{selected.email || selected.id}</p>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                    <Link to={`/players/${selected.id}`}>View profile</Link>
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Rank (1–20)</Label>
                  <Input
                    inputMode="numeric"
                    placeholder="Leave blank to unrank"
                    value={editUser.rank}
                    onChange={(e) => setEditUser((s) => ({ ...s, rank: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs"
                    disabled={setRank.isPending}
                    onClick={() => {
                      const n = toIntOrNull(editUser.rank);
                      setRank.mutate({ userId: selected.id, newRank: n });
                    }}
                  >
                    Set rank
                  </Button>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Roles</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm">Admin</p>
                      <p className="text-xs text-muted-foreground">Full access</p>
                    </div>
                    <Switch
                      checked={selectedRoleSet.has("admin")}
                      disabled={!isAdmin || setUserRole.isPending}
                      onCheckedChange={(checked) => setUserRole.mutate({ userId: selected.id, role: "admin", enabled: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm">Manager</p>
                      <p className="text-xs text-muted-foreground">Moderation access</p>
                    </div>
                    <Switch
                      checked={selectedRoleSet.has("moderator")}
                      disabled={!isAdmin || setUserRole.isPending}
                      onCheckedChange={(checked) =>
                        setUserRole.mutate({ userId: selected.id, role: "moderator", enabled: checked })
                      }
                    />
                  </div>
                  {!isAdmin && (
                    <p className="text-[11px] text-muted-foreground">
                      Only admins can change roles.
                    </p>
                  )}
                </div>
              </div>

              <SeparatorBlock />

              <div className="space-y-2">
                <p className="text-sm font-semibold">Stats</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Played</Label>
                    <Input
                      inputMode="numeric"
                      value={editUser.matchesPlayed}
                      onChange={(e) => setEditUser((s) => ({ ...s, matchesPlayed: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Wins</Label>
                    <Input
                      inputMode="numeric"
                      value={editUser.wins}
                      onChange={(e) => setEditUser((s) => ({ ...s, wins: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Losses</Label>
                    <Input
                      inputMode="numeric"
                      value={editUser.losses}
                      onChange={(e) => setEditUser((s) => ({ ...s, losses: e.target.value }))}
                    />
                  </div>
                </div>
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={updateStats.isPending}
                  onClick={() => {
                    const matchesPlayed = toIntOrNull(editUser.matchesPlayed) ?? 0;
                    const wins = toIntOrNull(editUser.wins) ?? 0;
                    const losses = toIntOrNull(editUser.losses) ?? 0;
                    updateStats.mutate({
                      userId: selected.id,
                      patch: { matches_played: matchesPlayed, wins, losses },
                    });
                  }}
                >
                  Save stats
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser((s) => ({ ...s, open: false }))}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={schedule.open} onOpenChange={(open) => setSchedule((s) => ({ ...s, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule a match</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Player A</Label>
                <Select value={schedule.playerA} onValueChange={(v) => setSchedule((s) => ({ ...s, playerA: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select player" />
                  </SelectTrigger>
                  <SelectContent>
                    {(profiles || []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name || p.email || p.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Player B</Label>
                <Select value={schedule.playerB} onValueChange={(v) => setSchedule((s) => ({ ...s, playerB: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select player" />
                  </SelectTrigger>
                  <SelectContent>
                    {(profiles || []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name || p.email || p.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={schedule.date}
                  onChange={(e) => setSchedule((s) => ({ ...s, date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Court</Label>
                <Select value={schedule.courtId} onValueChange={(v) => setSchedule((s) => ({ ...s, courtId: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Court 1</SelectItem>
                    <SelectItem value="2">Court 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start time</Label>
                <Input
                  type="time"
                  value={schedule.startTime}
                  onChange={(e) => setSchedule((s) => ({ ...s, startTime: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End time</Label>
                <Input
                  type="time"
                  value={schedule.endTime}
                  onChange={(e) => setSchedule((s) => ({ ...s, endTime: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                placeholder="Optional"
                value={schedule.notes}
                onChange={(e) => setSchedule((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                if (!schedule.playerA || !schedule.playerB) {
                  toast.error("Select both players");
                  return;
                }
                if (schedule.playerA === schedule.playerB) {
                  toast.error("Players must be different");
                  return;
                }
                createSchedule.mutate({
                  playerA: schedule.playerA,
                  playerB: schedule.playerB,
                  date: schedule.date,
                  startTime: schedule.startTime,
                  endTime: schedule.endTime,
                  courtId: Number(schedule.courtId) || 1,
                  notes: schedule.notes.trim() ? schedule.notes.trim() : null,
                });
              }}
              disabled={createSchedule.isPending || profilesLoading}
            >
              Create
            </Button>
            <Button variant="outline" onClick={() => setSchedule((s) => ({ ...s, open: false }))}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SeparatorBlock() {
  return <div className="h-px bg-border" />;
}
