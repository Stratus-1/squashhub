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
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { AdminEmailMarketing } from "@/components/admin/AdminEmailMarketing";
import {
  Users, Swords, Trophy, CalendarDays, Shield, AlertTriangle,
  BarChart3, Megaphone, Clock, ChevronRight, Activity, BookOpen,
  Calendar, Wrench, Download, Upload, UserCog, ClipboardList, Plus, MapPin, LifeBuoy
} from "lucide-react";

type ProfileRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  rank: number | null; // kept for compatibility but not used as source of truth
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

type SeasonMembershipRow = {
  season_id: string;
  user_id: string;
  joined_at: string;
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
  season_id?: string | null;
  kind?: "club" | "social" | string;
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

type CourtPresenceRow = {
  id: string;
  user_id: string;
  observed_at: string;
  source: "web" | "native" | string;
  accuracy_m: number | null;
  distance_m: number;
  radius_m: number;
  at_court: boolean;
  had_booking: boolean;
  booking_id: string | null;
  created_at: string;
};

type EventRequestRow = {
  id: string;
  user_id: string;
  season_id: string | null;
  kind: "social" | "club" | string;
  title: string;
  description: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  visibility: "public" | "members";
  status: "pending" | "approved" | "declined" | string;
  admin_notes: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
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

function timeToMinutes(t: string) {
  const [hhRaw, mmRaw] = String(t || "").split(":");
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function minutesToTime(m: number) {
  const mm = ((m % 60) + 60) % 60;
  const hh = Math.floor(m / 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function snapMinutesTo30(m: number, mode: "floor" | "ceil") {
  return mode === "floor" ? Math.floor(m / 30) * 30 : Math.ceil(m / 30) * 30;
}

function normalizeBookingTimes(startTime: string, endTime: string) {
  const minM = 6 * 60;
  const maxM = 22 * 60;

  const s0 = timeToMinutes(startTime);
  const e0 = timeToMinutes(endTime);

  let s = s0 == null ? minM : snapMinutesTo30(s0, "floor");
  let e = e0 == null ? maxM : snapMinutesTo30(e0, "ceil");

  s = Math.max(minM, Math.min(maxM - 30, s));
  e = Math.max(s + 30, Math.min(maxM, e));

  return { start: minutesToTime(s), end: minutesToTime(e) };
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

  const [seasonViewId, setSeasonViewId] = useState<string | null>(null);

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

  const [disputeResolve, setDisputeResolve] = useState<{
    open: boolean;
    matchId: string;
    winnerId: string;
    notes: string;
  }>({ open: false, matchId: "", winnerId: "", notes: "" });

  const [manualMatch, setManualMatch] = useState<{
    open: boolean;
    playerA: string;
    playerB: string;
    winnerId: string;
    matchDate: string;
    courtId: string;
    durationMin: string;
    isFriendly: boolean;
    autoConfirm: boolean;
    score: string;
    setScores: string;
    bestOf: string;
    pointsTo: string;
    notes: string;
  }>({
    open: false,
    playerA: "",
    playerB: "",
    winnerId: "",
    matchDate: format(new Date(), "yyyy-MM-dd"),
    courtId: "1",
    durationMin: "30",
    isFriendly: false,
    autoConfirm: true,
    score: "",
    setScores: "",
    bestOf: "5",
    pointsTo: "15",
    notes: "",
  });

  const [bookingSearch, setBookingSearch] = useState("");
  const [courtBlock, setCourtBlock] = useState<{
    open: boolean;
    courtId: string;
    date: string;
    startTime: string;
    endTime: string;
    reason: string;
  }>({ open: false, courtId: "1", date: format(new Date(), "yyyy-MM-dd"), startTime: "06:00", endTime: "22:00", reason: "Maintenance" });

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
    emailMode: "fallback" | "marketing";
    eventId: string;
    title: string;
    message: string;
    url: string;
  }>({
    template: "custom",
    audience: "all",
    emailMode: "fallback",
    eventId: "",
    title: "",
    message: "",
    url: "/events",
  });

  const { data: notificationPrefs } = useQuery({
    queryKey: ["admin", "notification-preferences"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notification_preferences")
        .select("user_id,transactional_email_enabled,marketing_email_enabled,email_fallback_only");
      if (error) {
        if ((error as any).code === "42P01") return [];
        throw error;
      }
      return data || [];
    },
    enabled: isAdmin || isManager,
  });

  const marketingOptInUserIds = useMemo(() => {
    return new Set<string>(
      (notificationPrefs || [])
        .filter((p: any) => p?.marketing_email_enabled === true)
        .map((p: any) => String(p.user_id))
    );
  }, [notificationPrefs]);

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

  const { data: unbookedCourtPresence, isLoading: unbookedCourtPresenceLoading } = useQuery({
    queryKey: ["admin", "court-presence", "unbooked"],
    queryFn: async () => {
      const { data, error } = await fromExt("court_presence_events")
        .select("*")
        .eq("at_court", true)
        .eq("had_booking", false)
        .order("observed_at", { ascending: false })
        .limit(50);
      if (error) {
        // If the DB hasn't been migrated yet, don't break the whole admin page.
        if ((error as any).code === "42P01") return [] as CourtPresenceRow[];
        throw error;
      }
      return (data || []) as unknown as CourtPresenceRow[];
    },
    enabled: isAdmin || isManager,
  });

  const { data: eventRequests, isLoading: eventRequestsLoading } = useQuery({
    queryKey: ["admin", "event-requests"],
    queryFn: async () => {
      const { data, error } = await fromExt("event_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        if ((error as any).code === "42P01") return [] as EventRequestRow[];
        throw error;
      }
      return (data || []) as unknown as EventRequestRow[];
    },
    enabled: isAdmin || isManager,
  });

  const decideEventRequest = useMutation({
    mutationFn: async (payload: { id: string; status: "approved" | "declined"; adminNotes?: string }) => {
      const patch: any = {
        status: payload.status,
        admin_notes: payload.adminNotes?.trim() || null,
        decided_by: user?.id || null,
        decided_at: new Date().toISOString(),
      };
      const { error } = await fromExt("event_requests").update(patch).eq("id", payload.id);
      if (error) throw error;

      // notify requester
      const req = (eventRequests || []).find((r) => r.id === payload.id);
      if (req?.user_id) {
        const title = payload.status === "approved" ? "Event request approved" : "Event request declined";
        const msg = payload.status === "approved"
          ? `Your request "${req.title}" was approved. Watch Events for the published event.`
          : `Your request "${req.title}" was declined.${payload.adminNotes?.trim() ? ` Note: ${payload.adminNotes.trim()}` : ""}`;
        await supabase.from("notifications").insert({
          user_id: req.user_id,
          title,
          message: msg,
          type: "admin",
          url: "/events",
          data: { event_request_id: req.id, status: payload.status },
        } as any);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "event-requests"] });
      toast.success("Request updated");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update request"),
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

  // All bookings for admin management
  const { data: allBookings, isLoading: bookingsLoading } = useQuery({
    queryKey: ["admin", "bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .order("date", { ascending: false })
        .order("start_time", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data || []) as Array<{
        id: string; court_id: number; user_id: string; date: string;
        start_time: string; end_time: string; status: string; created_at: string;
        is_blocked?: boolean;
        block_reason?: string | null;
      }>;
    },
    enabled: isAdmin || isManager,
  });

  const filteredBookings = useMemo(() => {
    const q = bookingSearch.trim().toLowerCase();
    const list = allBookings || [];
    if (!q) return list;
    return list.filter((b) => {
      const playerName = profileMap.get(b.user_id)?.name || "";
      return `${playerName} ${b.date} ${b.court_id}`.toLowerCase().includes(q);
    });
  }, [allBookings, bookingSearch, profileMap]);

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
  const viewingSeasonId = seasonViewId || activeSeason?.id || ((seasons || [])[0]?.id ?? null);
  const viewingSeason = useMemo(
    () => (seasons || []).find((s) => s.id === viewingSeasonId) || null,
    [seasons, viewingSeasonId]
  );

  const { data: seasonMembershipCounts } = useQuery({
    queryKey: ["admin", "season-membership-counts", (seasons || []).map((s) => s.id).join(",")],
    queryFn: async () => {
      const ids = (seasons || []).map((s) => s.id);
      if (ids.length === 0) return new Map<string, number>();
      const { data, error } = await fromExt("season_memberships")
        .select("season_id,user_id")
        .in("season_id", ids)
        .limit(10000);
      if (error) {
        if ((error as any).code === "42P01") return new Map<string, number>();
        throw error;
      }
      const map = new Map<string, number>();
      for (const row of data || []) {
        const sid = String((row as any).season_id || "");
        if (!sid) continue;
        map.set(sid, (map.get(sid) || 0) + 1);
      }
      return map;
    },
    enabled: (isAdmin || isManager) && !!seasons && seasons.length > 0,
  });

  const { data: seasonEventCounts } = useQuery({
    queryKey: ["admin", "season-event-counts", (seasons || []).map((s) => s.id).join(",")],
    queryFn: async () => {
      const ids = (seasons || []).map((s) => s.id);
      if (ids.length === 0) return new Map<string, number>();
      try {
        const { data, error } = await fromExt("events")
          .select("season_id")
          .in("season_id", ids)
          .limit(10000);
        if (error) throw error;
        const map = new Map<string, number>();
        for (const row of data || []) {
          const sid = String((row as any).season_id || "");
          if (!sid) continue;
          map.set(sid, (map.get(sid) || 0) + 1);
        }
        return map;
      } catch (e: any) {
        const code = e?.code || e?.details?.code;
        const msg = String(e?.message || "");
        const maybeMissingColumn = code === "42703" || msg.includes("season_id");
        if (maybeMissingColumn) return new Map<string, number>();
        throw e;
      }
    },
    enabled: (isAdmin || isManager) && !!seasons && seasons.length > 0,
  });

  const { data: seasonMemberships, isLoading: seasonMembershipsLoading } = useQuery({
    queryKey: ["admin", "season-memberships", viewingSeasonId],
    queryFn: async () => {
      if (!viewingSeasonId) return [] as SeasonMembershipRow[];
      const { data, error } = await fromExt("season_memberships")
        .select("season_id,user_id,joined_at")
        .eq("season_id", viewingSeasonId)
        .order("joined_at", { ascending: true })
        .limit(2000);
      if (error) {
        if ((error as any).code === "42P01") return [] as SeasonMembershipRow[];
        throw error;
      }
      return (data || []) as unknown as SeasonMembershipRow[];
    },
    enabled: (isAdmin || isManager) && !!viewingSeasonId,
  });

  const seasonMemberIds = useMemo(
    () => [...new Set((seasonMemberships || []).map((m) => String(m.user_id)).filter(Boolean))],
    [seasonMemberships]
  );

  const { data: seasonSnapshot, isLoading: seasonSnapshotLoading } = useQuery({
    queryKey: ["admin", "season-snapshot", viewingSeasonId, seasonMemberIds.join(",")],
    queryFn: async () => {
      if (!viewingSeasonId) return [] as Array<{ user_id: string; rank: number | null; matches_played: number; wins: number; losses: number }>;
      if (!seasonMemberIds || seasonMemberIds.length === 0) return [];
      const { data, error } = await fromExt("season_profiles")
        .select("season_id,user_id,rank,matches_played,wins,losses")
        .eq("season_id", viewingSeasonId)
        .in("user_id", seasonMemberIds.length > 0 ? seasonMemberIds : ["00000000-0000-0000-0000-000000000000"])
        .order("rank", { ascending: true })
        .limit(2000);
      if (error) {
        if ((error as any).code === "42P01") return [];
        throw error;
      }
      return (data || []) as any[];
    },
    enabled: (isAdmin || isManager) && !!viewingSeasonId && !!viewingSeason && !viewingSeason.is_active,
  });

  const { data: seasonEvents, isLoading: seasonEventsLoading } = useQuery({
    queryKey: ["admin", "season-events", viewingSeasonId],
    queryFn: async () => {
      if (!viewingSeasonId) return [] as AdminEventRow[];
      try {
        const { data, error } = await fromExt("events")
          .select("id,title,starts_at,status,visibility,kind,season_id,created_by,created_at,updated_at,ends_at,location,court_id,capacity,rsvp_deadline,description")
          .eq("season_id", viewingSeasonId)
          .order("starts_at", { ascending: true })
          .limit(250);
        if (error) throw error;
        return (data || []) as unknown as AdminEventRow[];
      } catch (e: any) {
        const code = e?.code || e?.details?.code;
        const msg = String(e?.message || "");
        const maybeMissingColumn = code === "42703" || msg.includes("season_id");
        if (!maybeMissingColumn) throw e;

        // Fallback: if season_id doesn't exist (older DB), approximate by date range.
        const from = viewingSeason?.starts_on as string | undefined;
        const to = (viewingSeason?.ends_on as string | null) || new Date().toISOString().slice(0, 10);
        if (!from) return [] as AdminEventRow[];
        const { data, error } = await fromExt("events")
          .select("*")
          .gte("starts_at", `${from}T00:00:00.000Z`)
          .lte("starts_at", `${to}T23:59:59.999Z`)
          .order("starts_at", { ascending: true })
          .limit(250);
        if (error) throw error;
        return (data || []) as unknown as AdminEventRow[];
      }
    },
    enabled: (isAdmin || isManager) && !!viewingSeasonId,
  });

  const seasonMemberRows = useMemo(() => {
    const byUserId = new Map((seasonSnapshot || []).map((r: any) => [String(r.user_id), r]));
    const rows = (seasonMemberships || []).map((m) => {
      const userId = String(m.user_id);
      const profile = profileMap.get(userId) || null;
      const snap = byUserId.get(userId) || null;
      const statsFrom = viewingSeason?.is_active ? profile : snap;
      const matchesPlayed = Number((statsFrom as any)?.matches_played || 0);
      const wins = Number((statsFrom as any)?.wins || 0);
      const losses = Number((statsFrom as any)?.losses || 0);
      const rank = (statsFrom as any)?.rank ?? null;
      const winRate = matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : null;
      return {
        user_id: userId,
        joined_at: m.joined_at,
        name: (profile?.name || "").trim() || "Unknown",
        rank: typeof rank === "number" ? rank : null,
        matches_played: matchesPlayed,
        wins,
        losses,
        win_rate: winRate,
      };
    });

    rows.sort((a, b) => {
      const ar = a.rank == null ? 1e9 : a.rank;
      const br = b.rank == null ? 1e9 : b.rank;
      if (ar !== br) return ar - br;
      if (a.matches_played !== b.matches_played) return b.matches_played - a.matches_played;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [profileMap, seasonMemberships, seasonSnapshot, viewingSeason?.is_active]);

  const seasonMemberSummary = useMemo(() => {
    const memberCount = seasonMemberRows.length;
    const activeCount = seasonMemberRows.filter((r) => r.matches_played > 0).length;
    const totalPlayed = seasonMemberRows.reduce((acc, r) => acc + (Number.isFinite(r.matches_played) ? r.matches_played : 0), 0);
    const totalWins = seasonMemberRows.reduce((acc, r) => acc + (Number.isFinite(r.wins) ? r.wins : 0), 0);
    const totalLosses = seasonMemberRows.reduce((acc, r) => acc + (Number.isFinite(r.losses) ? r.losses : 0), 0);
    const approxMatches = totalPlayed > 0 ? Math.round(totalPlayed / 2) : 0;
    return { memberCount, activeCount, totalPlayed, totalWins, totalLosses, approxMatches };
  }, [seasonMemberRows]);

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
      await queryClient.invalidateQueries({ queryKey: ["ladder"] });
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

  const recordManualMatch = useMutation({
    mutationFn: async () => {
      if (!manualMatch.playerA || !manualMatch.playerB) throw new Error("Select two players");
      if (manualMatch.playerA === manualMatch.playerB) throw new Error("Players must be different");
      if (!manualMatch.winnerId) throw new Error("Select the winner");
      if (manualMatch.winnerId !== manualMatch.playerA && manualMatch.winnerId !== manualMatch.playerB) {
        throw new Error("Winner must be one of the players");
      }
      if (!manualMatch.matchDate) throw new Error("Match date is required");

      const durationMin = toIntOrNull(manualMatch.durationMin);
      const durationS = durationMin != null ? Math.max(0, durationMin) * 60 : null;

      const bestOf = toIntOrNull(manualMatch.bestOf) ?? 5;
      const pointsTo = toIntOrNull(manualMatch.pointsTo) ?? 15;
      if (bestOf !== 3 && bestOf !== 5) throw new Error("Best of must be 3 or 5");
      if (!Number.isFinite(pointsTo) || pointsTo < 1 || pointsTo > 99) throw new Error("Points-to must be 1–99");

      const parseSets = (raw: string) => {
        const lines = raw
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        const sets: Array<{ a: number; b: number }> = [];
        for (const line of lines) {
          const cleaned = line.replace(/\s+/g, "");
          const m = cleaned.match(/^(\d+)[-:](\d+)$/);
          if (!m) throw new Error(`Invalid set score: "${line}" (use e.g. 15-10)`);
          const a = Number(m[1]);
          const b = Number(m[2]);
          if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) throw new Error("Set scores must be >= 0");
          sets.push({ a: Math.trunc(a), b: Math.trunc(b) });
        }
        return sets;
      };

      const sets = manualMatch.setScores.trim() ? parseSets(manualMatch.setScores) : [];

      let score = manualMatch.score.trim();
      let gameScores: any = null;
      if (sets.length > 0) {
        const aSetsWon = sets.filter((s) => s.a > s.b).length;
        const bSetsWon = sets.filter((s) => s.b > s.a).length;
        if (!score) score = `${aSetsWon}-${bSetsWon}`;
        gameScores = { format: { best_of: bestOf, points_to: pointsTo }, sets };
      }

      const { data, error } = await rpcExt("admin_record_manual_match", {
        player_a: manualMatch.playerA,
        player_b: manualMatch.playerB,
        winner_id: manualMatch.winnerId,
        match_date: manualMatch.matchDate,
        score: score || null,
        game_scores: gameScores,
        court_id: toIntOrNull(manualMatch.courtId),
        duration_s: durationS,
        notes: manualMatch.notes.trim() || null,
        is_friendly: manualMatch.isFriendly,
        auto_confirm: manualMatch.autoConfirm,
      } as any);
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      await queryClient.invalidateQueries({ queryKey: ["matches"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      await queryClient.invalidateQueries({ queryKey: ["ladder"] });
      toast.success("Match recorded");
      setManualMatch((s) => ({
        ...s,
        open: false,
        playerA: "",
        playerB: "",
        winnerId: "",
        score: "",
        setScores: "",
        notes: "",
        isFriendly: false,
        autoConfirm: true,
      }));
    },
    onError: (err: any) => toast.error(err.message || "Failed to record match"),
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
    mutationFn: async (payload: { recipients: string[]; title: string; message: string; url: string; type?: string; data?: any }) => {
      const title = payload.title.trim();
      const message = payload.message.trim();
      const url = payload.url.trim() || "/events";
      const notifType = (payload.type || "general").trim();
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
          type: notifType,
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
      const { error: schedError } = await fromExt("scheduled_matches")
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

  // Admin cancel any booking
  const adminCancelBooking = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Booking cancelled");
    },
    onError: (err: any) => toast.error(err.message || "Failed to cancel booking"),
  });

  // Block court for maintenance (creates a booking under the admin's account)
  const blockCourt = useMutation({
    mutationFn: async (payload: { courtId: number; date: string; startTime: string; endTime: string; reason: string }) => {
      if (!user) throw new Error("Must be logged in");
      const norm = normalizeBookingTimes(payload.startTime, payload.endTime);
      const baseRow: any = {
        court_id: payload.courtId,
        user_id: user.id,
        opponent_id: null,
        is_friendly: true,
        challenge_id: null,
        date: payload.date,
        start_time: norm.start,
        end_time: norm.end,
        status: "active",
      };
      const blockRow: any = {
        ...baseRow,
        is_blocked: true,
        block_reason: payload.reason?.trim() || "Maintenance",
        blocked_by: user.id,
        blocked_at: new Date().toISOString(),
      };

      let { error } = await supabase.from("bookings").insert(blockRow as any);
      // If DB isn't migrated yet, fallback to plain booking insert.
      if (error?.code === "42703") {
        ({ error } = await supabase.from("bookings").insert(baseRow as any));
      }
      if (error) {
        if (error.code === "23505") throw new Error("That slot is already booked");
        if (error.code === "23514") throw new Error("Times must be on 30-minute boundaries (e.g. 10:00 or 10:30)");
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Court blocked for maintenance");
      setCourtBlock((s) => ({ ...s, open: false }));
    },
    onError: (err: any) => toast.error(err.message || "Failed to block court"),
  });

  const unblockCourt = useMutation({
    mutationFn: async (bookingId: string) => {
      if (!user?.id) throw new Error("Must be logged in");
      const patch: any = {
        status: "cancelled",
        cancel_kind: "cancel",
        cancel_reason: "Unblocked by admin",
        cancelled_by: user.id,
        cancelled_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("bookings").update(patch).eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Court unblocked");
    },
    onError: (err: any) => toast.error(err.message || "Failed to unblock court"),
  });

  // Resolve disputed match
  const resolveDispute = useMutation({
    mutationFn: async ({ matchId, winnerId, notes }: { matchId: string; winnerId: string; notes: string }) => {
      // Update the match winner and mark as undisputed + confirmed
      const { error } = await supabase.from("matches").update({
        winner_id: winnerId,
        disputed: false,
        confirmed: true,
      }).eq("id", matchId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      await queryClient.invalidateQueries({ queryKey: ["matches"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      await queryClient.invalidateQueries({ queryKey: ["ladder"] });
      toast.success("Dispute resolved");
      setDisputeResolve((s) => ({ ...s, open: false }));
    },
    onError: (err: any) => toast.error(err.message || "Failed to resolve dispute"),
  });

  // Suspend/unsuspend player
  const toggleSuspend = useMutation({
    mutationFn: async ({ userId, suspend }: { userId: string; suspend: boolean }) => {
      const patch: any = suspend ? { rank: null } : {};
      const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
      if (error) throw error;
      // Notify user
      const msg = suspend
        ? "Your account has been suspended by an admin. Contact the club for details."
        : "Your account has been reinstated by an admin.";
      await supabase.from("notifications").insert({
        user_id: userId,
        title: suspend ? "Account Suspended" : "Account Reinstated",
        message: msg,
        type: "admin",
      } as any);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      await queryClient.invalidateQueries({ queryKey: ["ladder"] });
      toast.success("Player status updated");
    },
    onError: (err: any) => toast.error(err.message || "Failed to update player"),
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

  /* ─── Computed KPIs ─── */
  const totalMembers = (profiles || []).length;
  const rankedMembers = (profiles || []).filter(p => p.matches_played > 0).length;
  const pendingChallenges = (challenges || []).filter(c => c.status === "pending").length;
  const disputedMatches = (matches || []).filter(m => m.disputed).length;
  const activeBookingsToday = (allBookings || []).filter(b => b.date === format(new Date(), "yyyy-MM-dd") && b.status === "active").length;
  const unconfirmedMatches = (matches || []).filter(m => !m.confirmed).length;

  const navSections = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "users", label: "Players", icon: Users },
    { id: "challenges", label: "Challenges", icon: Swords },
    { id: "matches", label: "Matches", icon: Trophy },
    { id: "bookings", label: "Bookings", icon: CalendarDays },
    { id: "schedule", label: "Schedule", icon: Clock },
    { id: "seasons", label: "Seasons", icon: Calendar },
    { id: "clubops", label: "Club Ops", icon: Wrench },
  ];

  const [activeSection, setActiveSection] = useState("overview");

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Admin" description="Admin panel — manage players, bookings, matches, and club operations." path="/admin" noIndex />

      {/* ─── Top Header Bar ─── */}
      <div className="border-b border-border bg-card sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 lg:px-6 h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold font-heading tracking-tight">Admin Dashboard</h1>
              <p className="text-[10px] text-muted-foreground">{isAdmin ? "Administrator" : "Manager"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && <Badge className="bg-primary/15 text-primary border-primary/20 text-[10px]">Admin</Badge>}
            {isManager && <Badge variant="secondary" className="text-[10px]">Manager</Badge>}
            <Button variant="ghost" size="sm" asChild>
              <Link to="/dashboard">← Back</Link>
            </Button>
          </div>
        </div>

        {/* Mobile horizontal nav */}
        <div className="lg:hidden overflow-x-auto border-t border-border">
          <div className="flex px-2 py-1.5 gap-1 min-w-max">
            {navSections.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                  activeSection === s.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <s.icon className="w-3.5 h-3.5" />
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex">
        {/* ─── Desktop Sidebar ─── */}
        <aside className="hidden lg:flex flex-col w-56 min-h-[calc(100vh-3.5rem)] border-r border-border bg-card/50 shrink-0">
          <nav className="flex-1 p-3 space-y-0.5">
            {navSections.map(s => {
              const badgeCount =
                s.id === "challenges" ? pendingChallenges :
                s.id === "matches" ? disputedMatches :
                0;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                    activeSection === s.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <s.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">{s.label}</span>
                  {badgeCount > 0 && (
                    <span className={cn(
                      "text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center",
                      activeSection === s.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-destructive/15 text-destructive"
                    )}>
                      {badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          <div className="p-3 border-t border-border">
            <p className="text-[10px] text-muted-foreground">
              {activeSeason ? `Season: ${activeSeason.name}` : "No active season"}
            </p>
          </div>
        </aside>

        {/* ─── Main Content ─── */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto bottom-nav-safe">
          {/* ── Overview ── */}
          {activeSection === "overview" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard label="Total Members" value={totalMembers} icon={<Users className="w-4 h-4" />} color="primary" onClick={() => setActiveSection("users")} />
                <KpiCard label="Ranked Players" value={rankedMembers} icon={<Trophy className="w-4 h-4" />} color="primary" onClick={() => setActiveSection("users")} />
                <KpiCard label="Pending Challenges" value={pendingChallenges} icon={<Swords className="w-4 h-4" />} color={pendingChallenges > 0 ? "accent" : "primary"} onClick={() => setActiveSection("challenges")} />
                <KpiCard label="Today's Bookings" value={activeBookingsToday} icon={<CalendarDays className="w-4 h-4" />} color="primary" onClick={() => setActiveSection("bookings")} />
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard label="Disputed" value={disputedMatches} icon={<AlertTriangle className="w-4 h-4" />} color={disputedMatches > 0 ? "destructive" : "primary"} onClick={() => setActiveSection("matches")} />
                <KpiCard label="Unconfirmed" value={unconfirmedMatches} icon={<ClipboardList className="w-4 h-4" />} color={unconfirmedMatches > 0 ? "accent" : "primary"} onClick={() => setActiveSection("matches")} />
                <KpiCard label="Scheduled" value={(scheduledMatches || []).filter(s => s.status === "scheduled").length} icon={<Clock className="w-4 h-4" />} color="primary" onClick={() => setActiveSection("schedule")} />
                <KpiCard label="Events" value={(events || []).filter(e => e.status === "published").length} icon={<Calendar className="w-4 h-4" />} color="primary" onClick={() => setActiveSection("clubops")} />
              </div>

              {/* Quick actions */}
              <Card className="p-4">
                <p className="text-sm font-semibold font-heading mb-3">Quick Actions</p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <Button variant="outline" className="h-auto py-3 flex-col gap-1.5" onClick={() => setSchedule(s => ({ ...s, open: true }))}>
                    <Clock className="w-4 h-4 text-primary" />
                    <span className="text-xs">Schedule Match</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-3 flex-col gap-1.5" onClick={() => setCourtBlock(s => ({ ...s, open: true }))}>
                    <Wrench className="w-4 h-4 text-primary" />
                    <span className="text-xs">Block Court</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-3 flex-col gap-1.5" asChild>
                    <Link to="/admin/events/new">
                    <Megaphone className="w-4 h-4 text-primary" />
                    <span className="text-xs">New Event</span>
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-auto py-3 flex-col gap-1.5" asChild>
                    <Link to="/admin/support">
                      <LifeBuoy className="w-4 h-4 text-primary" />
                      <span className="text-xs">Support Inbox</span>
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-auto py-3 flex-col gap-1.5" onClick={() => setSeasonStart(s => ({ ...s, open: true }))}>
                    <Calendar className="w-4 h-4 text-primary" />
                    <span className="text-xs">New Season</span>
                  </Button>
                </div>
              </Card>

              {/* Recent disputed matches */}
              {disputedMatches > 0 && (
                <Card className="p-4 border-destructive/20">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                    <p className="text-sm font-semibold font-heading text-destructive">Disputes Requiring Attention</p>
                  </div>
                  <div className="space-y-2">
                    {(matches || []).filter(m => m.disputed).slice(0, 3).map(m => {
                      const aName = profileMap.get(m.player_a)?.name || "Unknown";
                      const bName = profileMap.get(m.player_b)?.name || "Unknown";
                      return (
                        <div key={m.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                          <div>
                            <p className="text-sm font-medium">{aName} vs {bName}</p>
                            <p className="text-[11px] text-muted-foreground">{m.match_date} · {m.score || "No score"}</p>
                          </div>
                          <Button size="sm" className="h-8 text-xs" onClick={() => setDisputeResolve({ open: true, matchId: m.id, winnerId: m.winner_id || m.player_a, notes: "" })}>
                            Resolve
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Activity summary */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold font-heading">Recent Activity</p>
                </div>
                {auditLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : (auditLog || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No audit entries yet.</p>
                ) : (
                  <div className="space-y-2">
                    {(auditLog || []).slice(0, 5).map(row => {
                      const actorName = row.actor_id ? (profileMap.get(row.actor_id)?.name || "Unknown") : "System";
                      const when = row.created_at ? format(new Date(row.created_at), "MMM d, HH:mm") : "—";
                      return (
                        <div key={row.id} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm"><span className="font-medium">{actorName}</span> <span className="text-muted-foreground">{row.action.replace(/_/g, " ")}</span></p>
                            <p className="text-[11px] text-muted-foreground">{row.summary || "—"} · {when}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Court presence: users at courts without bookings */}
              <Card className="p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    <p className="text-sm font-semibold font-heading">Unbooked Court Visits</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {(unbookedCourtPresence || []).length}
                  </Badge>
                </div>

                {unbookedCourtPresenceLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : (unbookedCourtPresence || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No unbooked visits detected recently.</p>
                ) : (
                  <div className="space-y-2">
                    {(unbookedCourtPresence || []).slice(0, 5).map((row) => {
                      const who = profileMap.get(row.user_id)?.name || "Unknown";
                      const when = row.observed_at ? format(new Date(row.observed_at), "MMM d, HH:mm") : "—";
                      const dist = Number.isFinite(row.distance_m) ? `${Math.round(row.distance_m)}m` : "—";
                      const acc = row.accuracy_m != null && Number.isFinite(row.accuracy_m) ? `±${Math.round(row.accuracy_m)}m` : "—";
                      return (
                        <div key={row.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{who}</p>
                            <p className="text-[11px] text-muted-foreground">{when} · {dist} · {acc} · {row.source}</p>
                          </div>
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setActiveSection("bookings")}>
                            View bookings
                          </Button>
                        </div>
                      );
                    })}
                    {(unbookedCourtPresence || []).length > 5 && (
                      <p className="text-[11px] text-muted-foreground">Showing 5 of {(unbookedCourtPresence || []).length}.</p>
                    )}
                  </div>
                )}
              </Card>
            </motion.div>
          )}

          {/* ── Users Section ── */}
          {activeSection === "users" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <SectionHeader title="Player Management" subtitle={`${totalMembers} members · ${rankedMembers} ranked`} />

              <div className="flex flex-col sm:flex-row gap-2">
                <Input placeholder="Search name or email…" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="flex-1" />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                    const ladderRows = (profiles || []).sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(p => ({ name: p.name || "", email: p.email || "", matches_played: p.matches_played ?? 0, wins: p.wins ?? 0, losses: p.losses ?? 0 }));
                    downloadFile(`ladder-${format(new Date(), "yyyy-MM-dd")}.csv`, toCsv(ladderRows));
                  }}>
                    <Download className="w-3.5 h-3.5" /> Export
                  </Button>
                </div>
              </div>

              <Card className="p-0 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="font-semibold">Player</TableHead>
                      <TableHead className="font-semibold">Rank</TableHead>
                      <TableHead className="font-semibold">Record</TableHead>
                      <TableHead className="font-semibold">Win %</TableHead>
                      <TableHead className="font-semibold text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profilesLoading ? (
                      <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground py-8 text-center">Loading…</TableCell></TableRow>
                    ) : filteredProfiles.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground py-8 text-center">No players found.</TableCell></TableRow>
                    ) : (
                      filteredProfiles.slice(0, 50).map(p => {
                        const wr = p.matches_played > 0 ? Math.round((p.wins / p.matches_played) * 100) : 0;
                        return (
                          <TableRow key={p.id} className="hover:bg-muted/20">
                            <TableCell className="p-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{p.name || "—"}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{p.email || p.id.slice(0, 8)}</p>
                              </div>
                            </TableCell>
                            <TableCell className="p-3">
                              <span className="text-xs text-muted-foreground">—</span>
                            </TableCell>
                            <TableCell className="p-3">
                              <span className="text-sm tabular-nums font-medium">{p.wins}W–{p.losses}L</span>
                              <span className="text-[11px] text-muted-foreground ml-1.5">({p.matches_played})</span>
                            </TableCell>
                            <TableCell className="p-3">
                              <div className="flex items-center gap-2">
                                <Progress value={wr} className="h-1.5 w-12" />
                                <span className="text-xs tabular-nums text-muted-foreground">{wr}%</span>
                              </div>
                            </TableCell>
                            <TableCell className="p-3 text-right">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(p)}>
                                <UserCog className="w-3 h-3 mr-1" /> Edit
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </Card>
            </motion.div>
          )}

          {/* ── Challenges Section ── */}
          {activeSection === "challenges" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <SectionHeader title="Challenges" subtitle={`${pendingChallenges} pending`} />
              <Card className="p-0 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="font-semibold">Created</TableHead>
                      <TableHead className="font-semibold">Challenger</TableHead>
                      <TableHead className="font-semibold">Opponent</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold text-right">Update</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {challengesLoading ? (
                      <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground py-8 text-center">Loading…</TableCell></TableRow>
                    ) : (challenges || []).length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground py-8 text-center">No challenges.</TableCell></TableRow>
                    ) : (
                      (challenges || []).map(c => {
                        const challenger = profileMap.get(c.challenger_id)?.name || "Unknown";
                        const opponent = profileMap.get(c.opponent_id)?.name || "Unknown";
                        return (
                          <TableRow key={c.id} className="hover:bg-muted/20">
                            <TableCell className="p-3 text-xs text-muted-foreground">{format(new Date(c.created_at), "yyyy-MM-dd")}</TableCell>
                            <TableCell className="p-3 text-sm font-medium">{challenger}</TableCell>
                            <TableCell className="p-3 text-sm">{opponent}</TableCell>
                            <TableCell className="p-3">
                              <Badge variant="secondary" className={cn("capitalize", c.status === "pending" && "bg-accent/15 text-accent-foreground", c.status === "completed" && "bg-primary/15 text-primary")}>
                                {c.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="p-3 text-right">
                              <Select value={c.status} onValueChange={(value) => updateChallengeStatus.mutate({ challengeId: c.id, status: value as ChallengeRow["status"] })}>
                                <SelectTrigger className="h-7 w-[130px] ml-auto text-xs"><SelectValue /></SelectTrigger>
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
            </motion.div>
          )}

          {/* ── Matches Section ── */}
          {activeSection === "matches" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <SectionHeader title="Match Management" subtitle={`${disputedMatches} disputed · ${unconfirmedMatches} unconfirmed`} />

              <Card className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold font-heading">Record a match (manual)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Use this if players played but forgot to book/track the match in the app.
                    </p>
                  </div>
                  <Button size="sm" className="h-8 text-xs gap-1 shrink-0" onClick={() => setManualMatch((s) => ({ ...s, open: true }))}>
                    <Plus className="w-3 h-3" /> Add match
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Note: competitive matches without a linked challenge will update player stats, but won’t automatically move ladder ranks. Use the Players section to adjust ranks if needed.
                </p>
              </Card>

              <div className="grid grid-cols-3 gap-3">
                <Card className="p-3 text-center">
                  <p className="text-2xl font-bold font-heading">{(matches || []).length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
                </Card>
                <Card className={cn("p-3 text-center", disputedMatches > 0 && "border-destructive/30")}>
                  <p className={cn("text-2xl font-bold font-heading", disputedMatches > 0 && "text-destructive")}>{disputedMatches}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Disputed</p>
                </Card>
                <Card className="p-3 text-center">
                  <p className="text-2xl font-bold font-heading text-primary">{(matches || []).filter(m => m.confirmed).length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Confirmed</p>
                </Card>
              </div>

              <Card className="p-0 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Players</TableHead>
                      <TableHead className="font-semibold">Score</TableHead>
                      <TableHead className="font-semibold">Winner</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matchesLoading ? (
                      <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground py-8 text-center">Loading…</TableCell></TableRow>
                    ) : (matches || []).length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground py-8 text-center">No matches.</TableCell></TableRow>
                    ) : (
                      (matches || []).map(m => {
                        const aName = profileMap.get(m.player_a)?.name || "Unknown";
                        const bName = profileMap.get(m.player_b)?.name || "Unknown";
                        const winnerName = m.winner_id === m.player_a ? aName : m.winner_id === m.player_b ? bName : "—";
                        return (
                          <TableRow key={m.id} className={cn("hover:bg-muted/20", m.disputed && "bg-destructive/5")}>
                            <TableCell className="p-3 text-xs text-muted-foreground">{m.match_date}</TableCell>
                            <TableCell className="p-3 text-sm font-medium">{aName} vs {bName}</TableCell>
                            <TableCell className="p-3 text-sm tabular-nums">{m.score || "—"}</TableCell>
                            <TableCell className="p-3 text-sm">{winnerName}</TableCell>
                            <TableCell className="p-3">
                              <div className="flex gap-1.5">
                                {m.confirmed && <Badge variant="secondary" className="text-[10px] bg-primary/15 text-primary">Confirmed</Badge>}
                                {m.disputed && <Badge variant="secondary" className="text-[10px] bg-destructive/15 text-destructive">Disputed</Badge>}
                                {!m.confirmed && !m.disputed && <Badge variant="secondary" className="text-[10px]">Pending</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="p-3 text-right">
                              <div className="flex justify-end gap-1.5">
                                {m.disputed && (
                                  <Button size="sm" className="h-7 text-xs bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setDisputeResolve({ open: true, matchId: m.id, winnerId: m.winner_id || m.player_a, notes: "" })}>
                                    Resolve
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateMatch.mutate({ matchId: m.id, patch: { disputed: !m.disputed } })}>
                                  {m.disputed ? "Undispute" : "Dispute"}
                                </Button>
                                <Button size="sm" className="h-7 text-xs" disabled={m.confirmed} onClick={() => adminConfirmMatch.mutate(m.id)}>
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
            </motion.div>
          )}

          {/* ── Bookings Section ── */}
          {activeSection === "bookings" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <SectionHeader title="Booking Management" subtitle={`${activeBookingsToday} active today`} />

              <div className="flex flex-col sm:flex-row gap-2">
                <Input placeholder="Search player, date, court…" value={bookingSearch} onChange={(e) => setBookingSearch(e.target.value)} className="flex-1" />
                <Button onClick={() => setCourtBlock(s => ({ ...s, open: true }))} className="gap-1.5">
                  <Wrench className="w-3.5 h-3.5" /> Block Court
                </Button>
              </div>

              <Card className="p-0 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Time</TableHead>
                      <TableHead className="font-semibold">Court</TableHead>
                      <TableHead className="font-semibold">Player</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookingsLoading ? (
                      <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground py-8 text-center">Loading…</TableCell></TableRow>
                    ) : filteredBookings.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground py-8 text-center">No bookings found.</TableCell></TableRow>
                    ) : (
                      filteredBookings.slice(0, 100).map(b => {
                        const playerName = profileMap.get(b.user_id)?.name || "Unknown";
                        const isBlocked = !!(b as any).is_blocked;
                        const blockReason = (b as any).block_reason ? String((b as any).block_reason) : "";
                        return (
                          <TableRow key={b.id} className="hover:bg-muted/20">
                            <TableCell className="p-3 text-xs text-muted-foreground">{b.date}</TableCell>
                            <TableCell className="p-3 text-xs">{b.start_time?.slice(0, 5)}–{b.end_time?.slice(0, 5)}</TableCell>
                            <TableCell className="p-3 text-sm">Court {b.court_id}</TableCell>
                            <TableCell className="p-3 text-sm font-medium">
                              {isBlocked ? (
                                <div className="space-y-0.5">
                                  <p className="text-sm font-semibold">Blocked</p>
                                  <p className="text-[11px] text-muted-foreground truncate">{blockReason || "Maintenance"}</p>
                                </div>
                              ) : (
                                playerName
                              )}
                            </TableCell>
                            <TableCell className="p-3">
                              <Badge variant="secondary" className={cn("capitalize text-[10px]", b.status === "cancelled" && "bg-destructive/15 text-destructive", b.status === "active" && "bg-primary/15 text-primary")}>
                                {isBlocked && b.status === "active" ? "blocked" : b.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="p-3 text-right">
                              {isBlocked ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  disabled={b.status === "cancelled" || unblockCourt.isPending}
                                  onClick={() => { if (confirm(`Unblock Court ${b.court_id} on ${b.date} ${b.start_time?.slice(0, 5)}–${b.end_time?.slice(0, 5)}?`)) unblockCourt.mutate(b.id); }}
                                >
                                  Unblock
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  disabled={b.status === "cancelled" || adminCancelBooking.isPending}
                                  onClick={() => { if (confirm(`Cancel booking for ${playerName} on ${b.date}?`)) adminCancelBooking.mutate(b.id); }}
                                >
                                  Cancel
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </Card>
            </motion.div>
          )}

          {/* ── Schedule Section ── */}
          {activeSection === "schedule" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionHeader title="Match Schedule" subtitle="Admin-scheduled matches" />
                <Button size="sm" onClick={() => setSchedule(s => ({ ...s, open: true }))} className="gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> New
                </Button>
              </div>

              <Card className="p-0 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Time</TableHead>
                      <TableHead className="font-semibold">Players</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheduledLoading ? (
                      <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground py-8 text-center">Loading…</TableCell></TableRow>
                    ) : (scheduledMatches || []).length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground py-8 text-center">No scheduled matches.</TableCell></TableRow>
                    ) : (
                      (scheduledMatches || []).map(s => {
                        const aName = profileMap.get(s.player_a)?.name || "Unknown";
                        const bName = profileMap.get(s.player_b)?.name || "Unknown";
                        return (
                          <TableRow key={s.id} className="hover:bg-muted/20">
                            <TableCell className="p-3 text-xs text-muted-foreground">{s.scheduled_date}</TableCell>
                            <TableCell className="p-3 text-xs">{s.start_time}–{s.end_time} <span className="text-muted-foreground">(Court {s.court_id || "—"})</span></TableCell>
                            <TableCell className="p-3">
                              <p className="text-sm font-medium truncate">{aName} vs {bName}</p>
                              {s.notes && <p className="text-[11px] text-muted-foreground truncate">{s.notes}</p>}
                            </TableCell>
                            <TableCell className="p-3"><Badge variant="secondary" className="capitalize text-[10px]">{s.status}</Badge></TableCell>
                            <TableCell className="p-3 text-right">
                              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={s.status === "cancelled"} onClick={() => cancelSchedule.mutate({ scheduleId: s.id, bookingId: s.booking_id })}>
                                Cancel
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </Card>
            </motion.div>
          )}

          {/* ── Seasons Section ── */}
          {activeSection === "seasons" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <SectionHeader title="Season Management" subtitle={activeSeason ? `Active: ${activeSeason.name}` : "No active season"} />

              <Card className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold font-heading">Active Season</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {activeSeason ? `${activeSeason.name} — started ${activeSeason.starts_on}` : "No active season. Start one to begin tracking."}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setSeasonStart(s => ({ ...s, open: true }))}>
                      New Season
                    </Button>
                    {activeSeason && (
                      <Button size="sm" variant="outline" className="h-8 text-xs border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => setSeasonEnd(s => ({ ...s, open: true }))}>
                        End Season
                      </Button>
                    )}
                  </div>
                </div>
                {activeSeason && (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-[11px] text-muted-foreground">
                      View season members, ladder stats, and season events.
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      onClick={() => setSeasonViewId(activeSeason.id)}
                    >
                      View
                    </Button>
                  </div>
                )}
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <Card className="p-0 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="font-semibold">Season</TableHead>
                        <TableHead className="font-semibold">Dates</TableHead>
                        <TableHead className="font-semibold">Members</TableHead>
                        <TableHead className="font-semibold">Events</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(seasons || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="p-4 text-sm text-muted-foreground text-center">
                            No seasons yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (seasons || []).map((s) => {
                          const isSelected = !!viewingSeasonId && s.id === viewingSeasonId;
                          const members = seasonMembershipCounts?.get(s.id) ?? 0;
                          const evs = seasonEventCounts?.get(s.id) ?? 0;
                          return (
                            <TableRow
                              key={s.id}
                              className={cn("cursor-pointer", isSelected && "bg-primary/5")}
                              onClick={() => setSeasonViewId(s.id)}
                            >
                              <TableCell className="p-3 text-sm font-medium">{s.name}</TableCell>
                              <TableCell className="p-3 text-xs text-muted-foreground">
                                {s.starts_on} → {s.ends_on || "—"}
                              </TableCell>
                              <TableCell className="p-3 text-xs">{members}</TableCell>
                              <TableCell className="p-3 text-xs">{evs}</TableCell>
                              <TableCell className="p-3">
                                <Badge variant="secondary" className={cn("text-[10px]", s.is_active && "bg-primary/15 text-primary")}>
                                  {s.is_active ? "Active" : "Ended"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </Card>

                <div className="space-y-3">
                  {!viewingSeason ? (
                    <Card className="p-4">
                      <p className="text-sm text-muted-foreground">Select a season to view details.</p>
                    </Card>
                  ) : (
                    <>
                      <Card className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold font-heading truncate">{viewingSeason.name}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {viewingSeason.starts_on} → {viewingSeason.ends_on || "—"}
                            </p>
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <Badge variant="secondary" className={cn("text-[10px]", viewingSeason.is_active && "bg-primary/15 text-primary")}>
                              {viewingSeason.is_active ? "Active" : "Ended"}
                            </Badge>
                            <Button size="sm" className="h-7 text-xs" asChild>
                              <Link to={`/admin/events/new?seasonId=${encodeURIComponent(viewingSeason.id)}`}>New season event</Link>
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                          <div className="rounded-md border p-2">
                            <p className="text-[10px] text-muted-foreground">Members</p>
                            <p className="text-sm font-semibold">{seasonMemberSummary.memberCount}</p>
                          </div>
                          <div className="rounded-md border p-2">
                            <p className="text-[10px] text-muted-foreground">Active</p>
                            <p className="text-sm font-semibold">{seasonMemberSummary.activeCount}</p>
                          </div>
                          <div className="rounded-md border p-2">
                            <p className="text-[10px] text-muted-foreground">Approx matches</p>
                            <p className="text-sm font-semibold">{seasonMemberSummary.approxMatches}</p>
                          </div>
                          <div className="rounded-md border p-2">
                            <p className="text-[10px] text-muted-foreground">Season events</p>
                            <p className="text-sm font-semibold">{(seasonEvents || []).length}</p>
                          </div>
                        </div>
                      </Card>

                      <Card className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold font-heading">Season members</p>
                          <Badge variant="secondary" className="text-[10px]">
                            {seasonMemberSummary.memberCount} total
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {viewingSeason.is_active ? "Stats are live from profiles." : "Stats are from the season snapshot (end of season)."}
                        </p>

                        {seasonMembershipsLoading || seasonSnapshotLoading ? (
                          <p className="text-sm text-muted-foreground mt-3">Loading…</p>
                        ) : seasonMemberRows.length === 0 ? (
                          <p className="text-sm text-muted-foreground mt-3">No members have joined this season yet.</p>
                        ) : (
                          <div className="mt-3 overflow-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/30">
                                  <TableHead className="font-semibold">Player</TableHead>
                                  <TableHead className="font-semibold">Joined</TableHead>
                                  <TableHead className="font-semibold">Rank</TableHead>
                                  <TableHead className="font-semibold">P</TableHead>
                                  <TableHead className="font-semibold">W</TableHead>
                                  <TableHead className="font-semibold">L</TableHead>
                                  <TableHead className="font-semibold">WR</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {seasonMemberRows.slice(0, 100).map((r) => {
                                  const joined = r.joined_at ? format(new Date(r.joined_at), "d MMM yyyy") : "—";
                                  return (
                                    <TableRow key={r.user_id} className="hover:bg-muted/20">
                                      <TableCell className="p-3 text-sm font-medium">
                                        <Link to={`/players/${r.user_id}`} className="underline decoration-muted-foreground/30 hover:decoration-muted-foreground">
                                          {r.name}
                                        </Link>
                                      </TableCell>
                                      <TableCell className="p-3 text-xs text-muted-foreground">{joined}</TableCell>
                                      <TableCell className="p-3 text-xs">{r.rank ?? "—"}</TableCell>
                                      <TableCell className="p-3 text-xs">{r.matches_played}</TableCell>
                                      <TableCell className="p-3 text-xs">{r.wins}</TableCell>
                                      <TableCell className="p-3 text-xs">{r.losses}</TableCell>
                                      <TableCell className="p-3 text-xs">{r.win_rate == null ? "—" : `${r.win_rate}%`}</TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                            {seasonMemberRows.length > 100 && (
                              <p className="text-[11px] text-muted-foreground mt-2">
                                Showing 100 of {seasonMemberRows.length}.
                              </p>
                            )}
                          </div>
                        )}
                      </Card>

                      <Card className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold font-heading">Season events</p>
                          <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                            <Link to="/events">View events</Link>
                          </Button>
                        </div>

                        {seasonEventsLoading ? (
                          <p className="text-sm text-muted-foreground mt-3">Loading…</p>
                        ) : !seasonEvents || seasonEvents.length === 0 ? (
                          <p className="text-sm text-muted-foreground mt-3">No events linked to this season yet.</p>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {seasonEvents.slice(0, 10).map((e) => {
                              const starts = e.starts_at ? format(new Date(e.starts_at), "d MMM yyyy HH:mm") : "—";
                              return (
                                <div key={e.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{e.title}</p>
                                    <p className="text-[11px] text-muted-foreground">
                                      {starts} · <Badge variant="secondary" className="text-[10px] capitalize">{e.status}</Badge>
                                      {(e as any).kind ? <> · <Badge variant="secondary" className="text-[10px] capitalize">{String((e as any).kind)}</Badge></> : null}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                                      <Link to={`/events/${e.id}`}>Open</Link>
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                                      <Link to={`/admin/events/${e.id}`}>Edit</Link>
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                            {seasonEvents.length > 10 && (
                              <p className="text-[11px] text-muted-foreground">Showing 10 of {seasonEvents.length}.</p>
                            )}
                          </div>
                        )}
                      </Card>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Club Ops Section ── */}
          {activeSection === "clubops" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <SectionHeader title="Club Operations" subtitle="Events, broadcasts, data tools, audit" />

              {/* Bulk tools */}
              <Card className="p-4">
                <p className="text-sm font-semibold font-heading mb-3">Data Tools</p>
                <div className="space-y-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs font-medium">Bulk import ladder</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Paste CSV: <code className="text-[10px] bg-muted px-1 rounded">email,rank</code> or <code className="text-[10px] bg-muted px-1 rounded">name,rank</code></p>
                    <Textarea className="mt-2 min-h-[80px] text-xs font-mono" placeholder="john@example.com,1&#10;jane@example.com,2" value={bulkRanksCsv} onChange={(e) => setBulkRanksCsv(e.target.value)} />
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" className="h-7 text-xs gap-1" disabled={!isAdmin || bulkSetRanks.isPending || !bulkRanksCsv.trim()} onClick={() => {
                        try {
                          const lines = bulkRanksCsv.trim().split("\n").map(l => l.trim()).filter(Boolean);
                          const assignments: Array<{ user_id: string; rank: number }> = [];
                          for (const line of lines) {
                            const [identifierRaw, rankRaw] = line.split(",").map(s => s.trim());
                            const rank = Number(rankRaw);
                            if (!identifierRaw || !Number.isFinite(rank) || rank < 1) continue;
                            let userId = identifierRaw;
                            if (!looksLikeUuid(identifierRaw)) {
                              const lower = identifierRaw.toLowerCase();
                              const byEmail = emailToIdMap.get(lower);
                              if (byEmail) { userId = byEmail; }
                              else {
                                const byName = (profiles || []).find(p => p.name?.toLowerCase() === lower);
                                if (!byName) { toast.error(`User not found: ${identifierRaw}`); return; }
                                userId = byName.id;
                              }
                            }
                            assignments.push({ user_id: userId, rank: Math.trunc(rank) });
                          }
                          if (assignments.length === 0) throw new Error("No assignments found");
                          bulkSetRanks.mutate({ assignments });
                        } catch (e: any) { toast.error(e?.message || "Invalid CSV"); }
                      }}>
                        <Upload className="w-3 h-3" /> Import
                      </Button>
                      <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={() => {
                        const ladderRows = (profiles || []).sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(p => ({ name: p.name || "", email: p.email || "", matches_played: p.matches_played ?? 0, wins: p.wins ?? 0, losses: p.losses ?? 0 }));
                        downloadFile(`ladder-${format(new Date(), "yyyy-MM-dd")}.csv`, toCsv(ladderRows));
                      }}>
                        <Download className="w-3 h-3" /> Export Ladder
                      </Button>
                      <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={() => {
                        const matchRows = (matches || []).map(m => ({ match_date: m.match_date, player_a: profileMap.get(m.player_a)?.name || m.player_a, player_b: profileMap.get(m.player_b)?.name || m.player_b, score: m.score || "", winner: m.winner_id ? (profileMap.get(m.winner_id)?.name || m.winner_id) : "", confirmed: m.confirmed, disputed: m.disputed, challenge_id: m.challenge_id || "" }));
                        downloadFile(`matches-${format(new Date(), "yyyy-MM-dd")}.csv`, toCsv(matchRows));
                      }}>
                        <Download className="w-3 h-3" /> Export Matches
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs font-medium">Merge duplicate users</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Moves data from source into target, then marks source as merged.</p>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Source (merge from)</Label>
                        <Select value={mergeUsers.sourceId} onValueChange={(v) => setMergeUsers(s => ({ ...s, sourceId: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent>{(profiles || []).map(p => <SelectItem key={p.id} value={p.id}>{p.name || "—"} {p.email ? `(${p.email})` : ""}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Target (keep)</Label>
                        <Select value={mergeUsers.targetId} onValueChange={(v) => setMergeUsers(s => ({ ...s, targetId: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent>{(profiles || []).map(p => <SelectItem key={p.id} value={p.id}>{p.name || "—"} {p.email ? `(${p.email})` : ""}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button size="sm" className="h-7 text-xs mt-2" disabled={!isAdmin || mergeDuplicateUsers.isPending} onClick={() => mergeDuplicateUsers.mutate({ sourceId: mergeUsers.sourceId, targetId: mergeUsers.targetId })}>
                      Merge Users
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Events */}
              <Card className="p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold font-heading">Events</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Create events and manage RSVPs.</p>
                  </div>
                  <Button size="sm" className="h-8 text-xs shrink-0" asChild>
                    <Link to="/admin/events/new">New Event</Link>
                  </Button>
                </div>

                <div className="rounded-lg border border-border p-3 mb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold font-heading">Event requests</p>
                      <p className="text-[11px] text-muted-foreground">Members can request a social/event for a season.</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {(eventRequests || []).filter((r) => r.status === "pending").length} pending
                    </Badge>
                  </div>

                  {eventRequestsLoading ? (
                    <p className="text-sm text-muted-foreground mt-2">Loading…</p>
                  ) : (eventRequests || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-2">No requests yet.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {(eventRequests || []).slice(0, 5).map((r) => {
                        const who = profileMap.get(r.user_id)?.name || r.user_id.slice(0, 8);
                        const when = r.created_at ? format(new Date(r.created_at), "d MMM HH:mm") : "—";
                        const pref = r.preferred_date ? `${r.preferred_date}${r.preferred_time ? ` ${String(r.preferred_time).slice(0, 5)}` : ""}` : "—";
                        return (
                          <div key={r.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3 bg-background">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px] capitalize">{r.kind}</Badge>
                                <Badge variant="secondary" className="text-[10px] capitalize">{r.status}</Badge>
                              </div>
                              <p className="text-sm font-medium mt-1 truncate">{r.title}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {who} · {when} · Preferred {pref}
                              </p>
                              {r.description ? (
                                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 whitespace-pre-line">{r.description}</p>
                              ) : null}
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-2">
                              <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                                <Link to={`/admin/events/new?requestId=${r.id}`}>Create event</Link>
                              </Button>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={decideEventRequest.isPending || r.status !== "pending"}
                                  onClick={() => decideEventRequest.mutate({ id: r.id, status: "approved" })}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  disabled={decideEventRequest.isPending || r.status !== "pending"}
                                  onClick={() => decideEventRequest.mutate({ id: r.id, status: "declined" })}
                                >
                                  Decline
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {(eventRequests || []).length > 5 && (
                        <p className="text-[11px] text-muted-foreground">Showing 5 of {(eventRequests || []).length}.</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {eventsLoading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : !events || events.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No events yet.</p>
                  ) : (
                    events.slice(0, 10).map(e => {
                      const starts = e.starts_at ? format(new Date(e.starts_at), "d MMM yyyy HH:mm") : "—";
                      return (
                        <div key={e.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{e.title}</p>
                            <p className="text-[11px] text-muted-foreground">{starts} · <Badge variant="secondary" className="text-[10px] capitalize">{e.status}</Badge></p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Select value={e.status} onValueChange={(value) => {
                              saveEvent.mutate({ id: e.id, title: e.title, description: e.description || null, starts_at: e.starts_at, ends_at: e.ends_at || null, location: e.location || null, court_id: e.court_id ?? null, capacity: e.capacity ?? null, rsvp_deadline: e.rsvp_deadline || null, visibility: e.visibility, status: value as any });
                            }}>
                              <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="draft">draft</SelectItem>
                                <SelectItem value="published">published</SelectItem>
                                <SelectItem value="cancelled">cancelled</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                              <Link to={`/admin/events/${e.id}`}>Edit</Link>
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>

              {/* Broadcast */}
	              <Card className="p-4">
	                <div className="flex items-center gap-2 mb-3">
	                  <Megaphone className="w-4 h-4 text-primary" />
	                  <p className="text-sm font-semibold font-heading">Broadcast</p>
	                </div>
	                <p className="text-xs text-muted-foreground mb-3">
	                  Send in-app + push notifications, with optional email delivery.
	                </p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-3">
	                    <div className="grid grid-cols-2 gap-2">
	                      <div className="space-y-1">
	                        <Label className="text-[10px] text-muted-foreground">Template</Label>
                        <Select value={broadcast.template} onValueChange={(value) => {
                          const v = value as any;
                          const templates: Record<string, { title: string; message: string; url: string }> = {
                            braai: { title: "Braai Social", message: "Friendly braai + social matches. RSVP in Events!", url: "/events" },
                            club_night: { title: "Club Night", message: "Club night matches are on. Book a court!", url: "/bookings" },
                            tournament: { title: "Tournament", message: "Tournament coming up! Check Events for details.", url: "/events" },
                            maintenance: { title: "Maintenance", message: "Courts unavailable during maintenance.", url: "/events" },
                          };
                          const t = templates[v];
                          setBroadcast(s => ({ ...s, template: v, ...(t ? { title: t.title, message: t.message, url: t.url } : {}) }));
                        }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="custom">Custom</SelectItem>
                            <SelectItem value="braai">Braai social</SelectItem>
                            <SelectItem value="club_night">Club night</SelectItem>
                            <SelectItem value="tournament">Tournament</SelectItem>
                            <SelectItem value="maintenance">Maintenance</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
	                      <div className="space-y-1">
	                        <Label className="text-[10px] text-muted-foreground">Audience</Label>
	                        <Select value={broadcast.audience} onValueChange={(value) => setBroadcast(s => ({ ...s, audience: value as any }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All members</SelectItem>
                            <SelectItem value="ranked">Ranked only</SelectItem>
                            <SelectItem value="active30">Active 30d</SelectItem>
                            <SelectItem value="strava">Strava-connected</SelectItem>
                            <SelectItem value="rsvp_event">RSVPed to event</SelectItem>
                          </SelectContent>
	                        </Select>
	                      </div>
	                    </div>
	                    <div className="space-y-1">
	                      <Label className="text-[10px] text-muted-foreground">Email</Label>
	                      <Select value={broadcast.emailMode} onValueChange={(value) => setBroadcast(s => ({ ...s, emailMode: value as any }))}>
	                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
	                        <SelectContent>
	                          <SelectItem value="fallback">Fallback (only if no push)</SelectItem>
	                          <SelectItem value="marketing">Marketing (opt-in)</SelectItem>
	                        </SelectContent>
	                      </Select>
	                      <p className="text-[11px] text-muted-foreground">
	                        Marketing emails require users to opt in (Profile → Email preferences).
	                      </p>
	                    </div>
	                    {broadcast.audience === "rsvp_event" && (
	                      <div className="space-y-1">
	                        <Label className="text-[10px] text-muted-foreground">Event</Label>
                        <Select value={broadcast.eventId} onValueChange={(value) => setBroadcast(s => ({ ...s, eventId: value }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select event…" /></SelectTrigger>
                          <SelectContent>{(events || []).map(e => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Title</Label>
                      <Input className="h-8 text-xs" value={broadcast.title} onChange={(e) => setBroadcast(s => ({ ...s, title: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Message</Label>
                      <Textarea className="min-h-[70px] text-xs" value={broadcast.message} onChange={(e) => setBroadcast(s => ({ ...s, message: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Link</Label>
                      <Input className="h-8 text-xs" value={broadcast.url} onChange={(e) => setBroadcast(s => ({ ...s, url: e.target.value }))} placeholder="/events" />
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs font-medium mb-2">Preview</p>
                    {(() => {
                      const allIds = (profiles || []).map(p => p.id);
                      let ids: string[] = [];
                      if (broadcast.audience === "all") ids = allIds;
                      if (broadcast.audience === "ranked") ids = (profiles || []).filter(p => p.matches_played > 0).map(p => p.id);
                      if (broadcast.audience === "active30") {
                        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
                        ids = (profiles || []).filter(p => { const last = (p as any).last_competitive_match_at as string | null | undefined; return last ? new Date(last).getTime() >= cutoff : false; }).map(p => p.id);
                      }
                      if (broadcast.audience === "strava") ids = (profiles || []).filter(p => !!(p as any).strava_connected).map(p => p.id);
                      if (broadcast.audience === "rsvp_event") ids = (rsvpAudienceUserIds || []) as string[];
	                      const count = ids.length;
	                      const emailCount =
	                        broadcast.emailMode === "marketing"
	                          ? ids.filter((uid) => marketingOptInUserIds.has(uid)).length
	                          : null;
	                      return (
	                        <div className="space-y-2">
	                          <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Recipients</span><span className="font-bold text-lg">{count}</span></div>
	                          {broadcast.emailMode === "marketing" ? (
	                            <div className="flex items-center justify-between text-xs">
	                              <span className="text-muted-foreground">Marketing emails</span>
	                              <span className="font-semibold">{emailCount}</span>
	                            </div>
	                          ) : (
	                            <p className="text-[11px] text-muted-foreground">
	                              Emails send as fallback only (members without push set up).
	                            </p>
	                          )}
	                          <div className="rounded-md border border-border p-3 bg-muted/30">
	                            <p className="text-xs font-semibold">{broadcast.title || "—"}</p>
	                            <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-line">{broadcast.message || "—"}</p>
	                          </div>
	                          <Button className="w-full h-8 text-xs" disabled={(!isAdmin && !isManager) || sendBroadcast.isPending || count === 0} onClick={() => {
	                            sendBroadcast.mutate({
	                              recipients: ids,
	                              title: broadcast.title,
	                              message: broadcast.message,
	                              url: broadcast.url,
	                              type: broadcast.emailMode === "marketing" ? "marketing" : "general",
	                              data: {
	                                kind: "broadcast",
	                                template: broadcast.template,
	                                email_mode: broadcast.emailMode,
	                                ...(broadcast.audience === "rsvp_event" && broadcast.eventId ? { event_id: broadcast.eventId } : {}),
	                              },
	                            });
	                          }}>
	                            {sendBroadcast.isPending ? "Sending…" : `Send to ${count} members`}
	                          </Button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </Card>

              <AdminEmailMarketing enabled={isAdmin || isManager} />

              {/* Audit Log */}
              <Card className="p-0 overflow-hidden">
                <div className="p-4 pb-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-semibold font-heading">Audit Log</p>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="font-semibold w-[18%]">Time</TableHead>
                      <TableHead className="font-semibold w-[18%]">Actor</TableHead>
                      <TableHead className="font-semibold w-[16%]">Action</TableHead>
                      <TableHead className="font-semibold w-[18%]">Entity</TableHead>
                      <TableHead className="font-semibold w-[30%]">Summary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLoading ? (
                      <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground py-8 text-center">Loading…</TableCell></TableRow>
                    ) : (auditLog || []).length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground py-8 text-center">No audit entries yet.</TableCell></TableRow>
                    ) : (
                      (auditLog || []).map(row => {
                        const actorName = row.actor_id ? (profileMap.get(row.actor_id)?.name || row.actor_id) : "System";
                        const when = row.created_at ? format(new Date(row.created_at), "yyyy-MM-dd HH:mm") : "—";
                        const entity = `${row.entity_table}${row.entity_id ? `:${row.entity_id.slice(0, 8)}` : ""}`;
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="p-3 text-xs text-muted-foreground">{when}</TableCell>
                            <TableCell className="p-3 text-xs font-medium">{actorName}</TableCell>
                            <TableCell className="p-3"><Badge variant="secondary" className="capitalize text-[10px]">{row.action.replace(/_/g, " ")}</Badge></TableCell>
                            <TableCell className="p-3 text-xs text-muted-foreground">{entity}</TableCell>
                            <TableCell className="p-3 text-xs text-muted-foreground">{row.summary || "—"}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </Card>
            </motion.div>
          )}
        </main>
      </div>

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
                <Select
                  value={eventEdit.courtId || "__none__"}
                  onValueChange={(v) => setEventEdit((s) => ({ ...s, courtId: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select court" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
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

              <SeparatorBlock />

              <div className="space-y-2">
                <p className="text-sm font-semibold text-destructive">Actions</p>
                <Button
                  variant="outline"
                  className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
                  disabled={!isAdmin || toggleSuspend.isPending}
                  onClick={() => {
                    const isSuspending = selected.matches_played > 0;
                    if (confirm(isSuspending
                      ? `Suspend ${selected.name}? This will notify them.`
                      : `Reinstate ${selected.name}?`
                    )) {
                      toggleSuspend.mutate({ userId: selected.id, suspend: isSuspending });
                    }
                  }}
                >
                  Suspend / Reinstate
                </Button>
                {!isAdmin && (
                  <p className="text-[11px] text-muted-foreground">Only admins can suspend players.</p>
                )}
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

      <Dialog open={manualMatch.open} onOpenChange={(open) => setManualMatch((s) => ({ ...s, open }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record manual match</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Player A</Label>
                <Select value={manualMatch.playerA} onValueChange={(v) => setManualMatch((s) => ({ ...s, playerA: v, winnerId: s.winnerId || v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(profiles || []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name || "—"} {p.email ? `(${p.email})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Player B</Label>
                <Select value={manualMatch.playerB} onValueChange={(v) => setManualMatch((s) => ({ ...s, playerB: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Winner</Label>
                <Select value={manualMatch.winnerId} onValueChange={(v) => setManualMatch((s) => ({ ...s, winnerId: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {manualMatch.playerA ? <SelectItem value={manualMatch.playerA}>Player A</SelectItem> : null}
                    {manualMatch.playerB ? <SelectItem value={manualMatch.playerB}>Player B</SelectItem> : null}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={manualMatch.matchDate} onChange={(e) => setManualMatch((s) => ({ ...s, matchDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Court</Label>
                <Select value={manualMatch.courtId} onValueChange={(v) => setManualMatch((s) => ({ ...s, courtId: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Court 1</SelectItem>
                    <SelectItem value="2">Court 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Duration (min)</Label>
                <Input inputMode="numeric" value={manualMatch.durationMin} onChange={(e) => setManualMatch((s) => ({ ...s, durationMin: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Best of</Label>
                <Select value={manualMatch.bestOf} onValueChange={(v) => setManualMatch((s) => ({ ...s, bestOf: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Points to</Label>
                <Input inputMode="numeric" value={manualMatch.pointsTo} onChange={(e) => setManualMatch((s) => ({ ...s, pointsTo: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Score (sets) (optional)</Label>
              <Input placeholder="e.g. 3-1" value={manualMatch.score} onChange={(e) => setManualMatch((s) => ({ ...s, score: e.target.value }))} />
              <p className="text-[11px] text-muted-foreground">
                If you enter set scores below, the score can be left blank.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Set scores (optional)</Label>
              <Textarea
                className="min-h-[90px] text-xs font-mono"
                placeholder={"Player A - Player B\n15-6\n15-8\n15-6"}
                value={manualMatch.setScores}
                onChange={(e) => setManualMatch((s) => ({ ...s, setScores: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea className="min-h-[70px]" value={manualMatch.notes} onChange={(e) => setManualMatch((s) => ({ ...s, notes: e.target.value }))} />
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Friendly match</p>
                  <p className="text-[11px] text-muted-foreground">
                    Friendly matches never affect ladder/stats.
                  </p>
                </div>
                <Switch checked={manualMatch.isFriendly} onCheckedChange={(checked) => setManualMatch((s) => ({ ...s, isFriendly: checked }))} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Auto-confirm (admin)</p>
                  <p className="text-[11px] text-muted-foreground">
                    If enabled, stats update immediately and players get a “confirmed” notification.
                  </p>
                </div>
                <Switch checked={manualMatch.autoConfirm} onCheckedChange={(checked) => setManualMatch((s) => ({ ...s, autoConfirm: checked }))} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManualMatch((s) => ({ ...s, open: false }))}>
              Cancel
            </Button>
            <Button disabled={recordManualMatch.isPending} onClick={() => recordManualMatch.mutate()}>
              {recordManualMatch.isPending ? "Saving…" : "Record match"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute Resolution Dialog */}
      <Dialog open={disputeResolve.open} onOpenChange={(open) => setDisputeResolve((s) => ({ ...s, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Dispute</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(() => {
              const m = (matches || []).find((m) => m.id === disputeResolve.matchId);
              if (!m) return <p className="text-sm text-muted-foreground">Match not found.</p>;
              const aName = profileMap.get(m.player_a)?.name || "Player A";
              const bName = profileMap.get(m.player_b)?.name || "Player B";
              return (
                <>
                  <p className="text-sm">
                    <strong>{aName}</strong> vs <strong>{bName}</strong> — {m.score || "no score"}
                  </p>
                  <div className="space-y-1.5">
                    <Label>Winner</Label>
                    <Select value={disputeResolve.winnerId} onValueChange={(v) => setDisputeResolve((s) => ({ ...s, winnerId: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={m.player_a}>{aName}</SelectItem>
                        <SelectItem value={m.player_b}>{bName}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Resolution notes</Label>
                    <Textarea
                      value={disputeResolve.notes}
                      onChange={(e) => setDisputeResolve((s) => ({ ...s, notes: e.target.value }))}
                      placeholder="Describe the resolution…"
                    />
                  </div>
                </>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeResolve((s) => ({ ...s, open: false }))}>Cancel</Button>
            <Button
              disabled={resolveDispute.isPending}
              onClick={() => resolveDispute.mutate({
                matchId: disputeResolve.matchId,
                winnerId: disputeResolve.winnerId,
                notes: disputeResolve.notes,
              })}
            >
              {resolveDispute.isPending ? "Resolving…" : "Resolve & Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block Court Dialog */}
      <Dialog open={courtBlock.open} onOpenChange={(open) => setCourtBlock((s) => ({ ...s, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block Court for Maintenance</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Court</Label>
                <Select value={courtBlock.courtId} onValueChange={(v) => setCourtBlock((s) => ({ ...s, courtId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Court 1</SelectItem>
                    <SelectItem value="2">Court 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={courtBlock.date} onChange={(e) => setCourtBlock((s) => ({ ...s, date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start time</Label>
                <Input
                  type="time"
                  step={1800}
                  value={courtBlock.startTime}
                  onChange={(e) => setCourtBlock((s) => ({ ...s, startTime: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End time</Label>
                <Input
                  type="time"
                  step={1800}
                  value={courtBlock.endTime}
                  onChange={(e) => setCourtBlock((s) => ({ ...s, endTime: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Input value={courtBlock.reason} onChange={(e) => setCourtBlock((s) => ({ ...s, reason: e.target.value }))} placeholder="Maintenance" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCourtBlock((s) => ({ ...s, open: false }))}>Cancel</Button>
            <Button
              disabled={blockCourt.isPending}
              onClick={() => blockCourt.mutate({
                courtId: Number(courtBlock.courtId) || 1,
                date: courtBlock.date,
                startTime: courtBlock.startTime,
                endTime: courtBlock.endTime,
                reason: courtBlock.reason,
              })}
            >
              {blockCourt.isPending ? "Blocking…" : "Block Court"}
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

function KpiCard({ label, value, icon, color, onClick }: { label: string; value: number; icon: React.ReactNode; color: "primary" | "accent" | "destructive"; onClick?: () => void }) {
  const colorClasses = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/15 text-accent-foreground",
    destructive: "bg-destructive/10 text-destructive",
  };
  return (
    <Card
      className={cn("p-4 cursor-pointer hover:shadow-md transition-shadow border-border", onClick && "hover:border-primary/30")}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-bold font-heading tabular-nums">{value}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p>
        </div>
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", colorClasses[color])}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-1">
      <h2 className="text-lg font-bold font-heading tracking-tight">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
