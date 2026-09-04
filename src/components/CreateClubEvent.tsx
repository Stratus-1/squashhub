import { useState, useMemo, useEffect } from "react";
import { sendWhatsApp } from "@/lib/whatsapp-send";
import { useWhatsAppEnabled } from "@/hooks/use-whatsapp-enabled";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarPlus, Loader2, Users, Trash2, Check, X, ChevronRight, ChevronLeft, Pencil, Info } from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useIsClubAdmin } from "@/hooks/use-club";
import { useHasPermission } from "@/hooks/use-club-permissions";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, addDays, addWeeks, addMonths, addYears } from "date-fns";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";

const fromExt = (table: string) => (supabase as any).from(table);

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EVENT_TYPES = [
  { value: "social", label: "Social", adminOnly: false },
  { value: "coaching", label: "Coaching", adminOnly: true },
  { value: "training", label: "Training", adminOnly: true },
  { value: "league", label: "League", adminOnly: true },
  { value: "other", label: "Other", adminOnly: false },
];

const TIME_OPTIONS = (() => {
  const opts: string[] = [];
  for (let h = 5; h < 22; h++) {
    opts.push(`${String(h).padStart(2, "0")}:00`);
    opts.push(`${String(h).padStart(2, "0")}:30`);
  }
  return opts;
})();

const RECURRENCE_OPTIONS = [
  { value: "once", label: "Once (no repeat)" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const REMINDER_OPTIONS = [
  { value: "0", label: "No reminder" },
  { value: "24", label: "24 hours before" },
  { value: "48", label: "48 hours before" },
  { value: "72", label: "72 hours before" },
];

type BookingFailure = { row: any; message: string };

function describeSlot(row: any, courtNames: Record<number, string>) {
  const court = courtNames[row.court_id] || `Court ${row.court_id}`;
  return `${court} · ${row.date} · ${String(row.start_time).slice(0, 5)}–${String(row.end_time).slice(0, 5)}`;
}

function reasonFor(message: string) {
  const m = (message || "").toLowerCase();
  if (m.includes("duplicate") || m.includes("no_double_booking") || m.includes("unique"))
    return "already booked by someone else";
  if (m.includes("row-level security") || m.includes("permission") || m.includes("policy"))
    return "not allowed for your account";
  if (m.includes("peak") || m.includes("cap") || m.includes("limit"))
    return "blocked by the club booking limit";
  if (m.includes("suspend")) return "member is suspended";
  return message || "unknown error";
}

/** Show a clear, actionable warning when court bookings could not be made. */
function reportBookingFailures(
  failures: BookingFailure[],
  total: number,
  courtNames: Record<number, string>,
) {
  if (failures.length === 0) return;
  const lines = failures.slice(0, 6).map((f) => `• ${describeSlot(f.row, courtNames)} — ${reasonFor(f.message)}`);
  if (failures.length > 6) lines.push(`• +${failures.length - 6} more slot(s)`);

  const allFailed = failures.length === total;
  const fix = [
    "",
    "What to do:",
    "1. Open Bookings for those dates and cancel/move the clashing booking.",
    "2. Or change the event time, or pick different courts.",
    "3. Then edit the event and save again to re-book the courts.",
  ].join("\n");

  const description = [...lines, fix].join("\n");

  if (allFailed) {
    toast.error("No court bookings could be made", { description, duration: 30000 });
  } else {
    toast.warning(`${failures.length} of ${total} court slots could not be booked`, {
      description,
      duration: 30000,
    });
  }
}

/* ---------- Peak-hour helpers (mirror the Bookings page rules) ---------- */

function timeToMin(t: string) {
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function peakWindowFor(club: any, dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  const start = String(club?.[weekend ? "peak_weekend_start" : "peak_weekday_start"] ?? (weekend ? "08:00:00" : "16:00:00")).slice(0, 5);
  const end = String(club?.[weekend ? "peak_weekend_end" : "peak_weekday_end"] ?? (weekend ? "12:00:00" : "19:00:00")).slice(0, 5);
  return { ps: timeToMin(start), pe: timeToMin(end), label: `${start}–${end}` };
}

/** Minutes of the event window that fall inside / outside peak hours. */
function splitPeakMinutes(club: any, dateStr: string, startT: string, endT: string) {
  const s = timeToMin(startT);
  const e = timeToMin(endT);
  const { ps, pe, label } = peakWindowFor(club, dateStr);
  const peak = Math.max(0, Math.min(e, pe) - Math.max(s, ps));
  return { peak, offPeak: Math.max(0, e - s - peak), peakLabel: label };
}




export function CreateClubEvent({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  const { club } = useClubContext();
  const { activeMember, isAdmin } = useMemberContext();
  const isFullAdmin = useIsClubAdmin();
  const canBypassBookingLimits = useHasPermission("bookings_unlimited");
  const canBypassNonPeak = useHasPermission("bookings_unlimited_non_peak");
  const canManageEvents = useHasPermission("events");
  const canCreateEvents = isAdmin || isFullAdmin || canManageEvents;
  const adminBypass = isAdmin || isFullAdmin || canBypassBookingLimits || canBypassNonPeak;
  const { data: myClubData } = useQuery({
    queryKey: ["my-club-fallback", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      // Deterministic: earliest joined membership (matches useMyClub), so users
      // who belong to more than one club always land on the same club context.
      const { data } = await (supabase as any)
        .from("club_members")
        .select("club_id, joined_at")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data?.club_id as string | null;
    },
    enabled: !club?.id && !(activeMember as any)?.club_id && !!user?.id,
    staleTime: 5 * 60 * 1000,
  });
  const queryClient = useQueryClient();
  const clubId = club?.id || (activeMember as any)?.club_id || myClubData || null;
  const whatsappEnabled = useWhatsAppEnabled(clubId);
  // Club-billed WhatsApp is an admin-only channel. Ordinary members can still
  // invite over WhatsApp, but from their own number via a wa.me share link.
  const canUseClubWhatsApp = whatsappEnabled && adminBypass;

  /** wa.me draft a member sends from their own number (no club cost). */
  const buildOwnWhatsAppShareUrl = () => {
    const when = form.event_date
      ? format(new Date(form.event_date), "EEE d MMM")
      : "";
    const lines = [
      `You're invited to "${form.title || "a squash event"}"`,
      [when, form.start_time].filter(Boolean).join(" at "),
      club?.name ? `at ${club.name}` : "",
      "",
      "Open the SquashHub app to RSVP.",
    ].filter(Boolean);
    return `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`;
  };


  const [createOpen, setCreateOpen] = useState(!!onClose);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [deleteBookings, setDeleteBookings] = useState(true);

  const [form, setForm] = useState({
    title: "",
    description: "",
    event_type: "social",
    event_date: format(new Date(), "yyyy-MM-dd"),
    start_time: "18:00",
    end_time: "19:00",
    recurrence: "once",
    num_instances: 12,
    reminder_hours: "48",
    invite_scope: "all",
    invite_scope_id: "",
    selected_member_ids: [] as string[],
    notify_push: true,
    notify_email: true,
    notify_whatsapp: false,
    light_fee_split: "creator",
    is_club_booking: false,
    booking_member_ids: [] as string[],
    court_ids: [] as number[],
    lights_auto_on: false,
  });

  // Fetch courts
  const { data: courts } = useQuery({
    queryKey: ["courts-list", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.from("courts").select("id, name").eq("club_id", clubId!).eq("is_external", false).order("id");
      if (error) throw error;
      return (data || []) as { id: number; name: string }[];
    },
    enabled: !!clubId,
  });

  // Fetch club members
  const { data: members } = useQuery({
    queryKey: ["club-members-list", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.from("club_members").select("id, name, user_id").eq("club_id", clubId!).order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string | null; user_id: string | null }[];
    },
    enabled: !!clubId,
  });

  // Fetch fee categories
  const { data: feeCategories } = useQuery({
    queryKey: ["fee-categories", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.from("member_fee_categories").select("id, name").eq("club_id", clubId!).order("sort_order");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    enabled: !!clubId && form.invite_scope === "category",
  });

  // Fetch leagues
  const { data: leagues } = useQuery({
    queryKey: ["leagues", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leagues").select("id, name").eq("club_id", clubId!).is("archived_at", null).order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    enabled: !!clubId && form.invite_scope === "league",
  });

  // Member IDs matching the selected league (pre-tick in checklist)
  const { data: leagueMemberIds } = useQuery({
    queryKey: ["league-member-ids", form.invite_scope_id],
    queryFn: async () => {
      const { data, error } = await fromExt("member_league_registrations")
        .select("club_member_id")
        .eq("league_id", form.invite_scope_id);
      if (error) throw error;
      return (data || []).map((r: any) => r.club_member_id as string);
    },
    enabled: form.invite_scope === "league" && !!form.invite_scope_id,
  });

  // Member IDs matching the selected fee category (pre-tick in checklist)
  const { data: categoryMemberIds } = useQuery({
    queryKey: ["category-member-ids", clubId, form.invite_scope_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_members")
        .select("id")
        .eq("club_id", clubId!)
        .eq("fee_category_id", form.invite_scope_id);
      if (error) throw error;
      return (data || []).map((r: any) => r.id as string);
    },
    enabled: form.invite_scope === "category" && !!form.invite_scope_id && !!clubId,
  });

  // Fetch existing club events (for display below the create button)
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["club-events", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_events")
        .select("*, club_event_courts(court_id)")
        .eq("club_id", clubId!)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
  });

  // Filter out events whose last instance has already ended (past events)
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return (events || []).filter((e: any) => {
      if (!e.start_date) return true;
      const endTime = String(e.end_time || "23:59").slice(0, 5);
      const start = new Date(`${e.start_date}T00:00:00`);
      const count = Math.max(1, Number(e.num_instances) || 1);
      const rec = e.recurrence || "once";
      const last = new Date(start);
      if (rec === "weekly") last.setDate(last.getDate() + (count - 1) * 7);
      else if (rec === "monthly") last.setMonth(last.getMonth() + (count - 1));
      else if (rec === "yearly") last.setFullYear(last.getFullYear() + (count - 1));
      const [hh, mm] = endTime.split(":").map(Number);
      last.setHours(hh || 23, mm || 59, 59, 999);
      return last >= now;
    });
  }, [events]);

  // Get RSVP counts + confirmed member names
  const eventIds = useMemo(() => upcomingEvents.map((e: any) => e.id), [upcomingEvents]);
  const { data: rsvpData } = useQuery({
    queryKey: ["club-event-rsvps-data", eventIds.join(",")],
    queryFn: async () => {
      if (eventIds.length === 0) return { counts: {}, confirmedNames: {}, declinedNames: {} };
      const { data, error } = await fromExt("club_event_rsvps")
        .select("event_id, status, club_member_id")
        .in("event_id", eventIds);
      if (error) throw error;
      const counts: Record<string, { invited: number; confirmed: number; declined: number }> = {};
      const confirmedMemberIds: Record<string, string[]> = {};
      const declinedMemberIds: Record<string, string[]> = {};
      for (const r of data || []) {
        if (!counts[r.event_id]) counts[r.event_id] = { invited: 0, confirmed: 0, declined: 0 };
        counts[r.event_id][r.status as "invited" | "confirmed" | "declined"]++;
        if (r.status === "confirmed") {
          if (!confirmedMemberIds[r.event_id]) confirmedMemberIds[r.event_id] = [];
          confirmedMemberIds[r.event_id].push(r.club_member_id);
        }
        if (r.status === "declined") {
          if (!declinedMemberIds[r.event_id]) declinedMemberIds[r.event_id] = [];
          declinedMemberIds[r.event_id].push(r.club_member_id);
        }
      }
      // Resolve member names for confirmed / declined attendees
      const allMemberIds = [...new Set([...Object.values(confirmedMemberIds).flat(), ...Object.values(declinedMemberIds).flat()])];
      const nameMap: Record<string, string> = {};
      if (allMemberIds.length > 0) {
        const { data: memberData } = await supabase
          .from("club_members")
          .select("id, name")
          .in("id", allMemberIds);
        for (const m of memberData || []) {
          nameMap[m.id] = m.name || "Unknown";
        }
      }
      const confirmedNames: Record<string, string[]> = {};
      for (const [eventId, mids] of Object.entries(confirmedMemberIds)) {
        confirmedNames[eventId] = mids.map((mid) => nameMap[mid] || "Unknown");
      }
      const declinedNames: Record<string, string[]> = {};
      for (const [eventId, mids] of Object.entries(declinedMemberIds)) {
        declinedNames[eventId] = mids.map((mid) => nameMap[mid] || "Unknown");
      }
      return { counts, confirmedNames, declinedNames };

    },
    enabled: eventIds.length > 0,
  });
  const rsvpCounts = rsvpData?.counts;
  const confirmedNames = rsvpData?.confirmedNames;
  const declinedNames = rsvpData?.declinedNames;


  // How many of each event's court slots are actually booked (spot missing bookings)
  const { data: bookingCoverage } = useQuery({
    queryKey: ["club-event-booking-coverage", eventIds.join(",")],
    queryFn: async () => {
      const out: Record<string, { booked: number; total: number }> = {};
      if (eventIds.length === 0) return out;
      const { data: insts } = await fromExt("club_event_instances")
        .select("event_id, instance_date")
        .in("event_id", eventIds);
      const dates = [...new Set((insts || []).map((i: any) => i.instance_date))];
      if (dates.length === 0) return out;
      const { data: bks } = await supabase
        .from("bookings")
        .select("court_id, date, start_time")
        .in("date", dates as string[])
        .eq("status", "active");
      const key = (c: any, d: any, t: any) => `${c}|${d}|${String(t).slice(0, 5)}`;
      const booked = new Set((bks || []).map((b: any) => key(b.court_id, b.date, b.start_time)));
      for (const e of upcomingEvents as any[]) {
        const courtIds = (e.club_event_courts || []).map((c: any) => c.court_id);
        const ds = (insts || []).filter((i: any) => i.event_id === e.id).map((i: any) => i.instance_date);
        let hit = 0;
        let total = 0;
        for (const d of ds) {
          for (const c of courtIds) {
            total++;
            if (booked.has(key(c, d, e.start_time))) hit++;
          }
        }
        out[e.id] = { booked: hit, total };
      }
      return out;
    },
    enabled: eventIds.length > 0,
  });



  // My RSVPs — check all linked members (family accounts sharing email)
  const { linkedMembers } = useMemberContext();
  const linkedMemberIds = useMemo(() => linkedMembers.map(m => m.id), [linkedMembers]);
  const myMemberId = activeMember?.id;
  const { data: myRsvps } = useQuery({
    queryKey: ["club-event-my-rsvps", linkedMemberIds.join(","), eventIds.join(",")],
    queryFn: async () => {
      if (linkedMemberIds.length === 0 || eventIds.length === 0) return {};
      const { data, error } = await fromExt("club_event_rsvps")
        .select("event_id, status, id, club_member_id")
        .in("club_member_id", linkedMemberIds)
        .in("event_id", eventIds);
      if (error) throw error;
      // Build map: event_id -> array of RSVPs (one per linked member)
      const map: Record<string, { id: string; status: string; club_member_id: string; memberName: string }[]> = {};
      for (const r of data || []) {
        if (!map[r.event_id]) map[r.event_id] = [];
        const member = linkedMembers.find(m => m.id === r.club_member_id);
        map[r.event_id].push({ id: r.id, status: r.status, club_member_id: r.club_member_id, memberName: member?.name || "Unknown" });
      }
      return map;
    },
    enabled: linkedMemberIds.length > 0 && eventIds.length > 0,
  });

  // Pre-tick league/category members when selection changes
  useEffect(() => {
    if (form.invite_scope === "league" && leagueMemberIds) {
      setForm((f) => ({ ...f, selected_member_ids: leagueMemberIds }));
    }
  }, [leagueMemberIds, form.invite_scope]);
  useEffect(() => {
    if (form.invite_scope === "category" && categoryMemberIds) {
      setForm((f) => ({ ...f, selected_member_ids: categoryMemberIds }));
    }
  }, [categoryMemberIds, form.invite_scope]);


  useEffect(() => {
    if (activeMember?.id && form.selected_member_ids.length === 0) {
      setForm((f) => ({
        ...f,
        selected_member_ids: [activeMember.id],
        booking_member_ids: [activeMember.id],
      }));
    }
  }, [activeMember?.id]);

  // Calculate instance dates based on recurrence
  const getInstanceDates = (): string[] => {
    const baseDate = new Date(form.event_date + "T00:00:00");
    if (form.recurrence === "once") return [form.event_date];
    const dates: string[] = [];
    const count = form.num_instances;
    for (let i = 0; i < count; i++) {
      let d: Date;
      if (form.recurrence === "weekly") d = addWeeks(baseDate, i);
      else if (form.recurrence === "monthly") d = addMonths(baseDate, i);
      else d = addYears(baseDate, i);
      dates.push(format(d, "yyyy-MM-dd"));
    }
    return dates;
  };

  // Check court availability for the selected dates/times/courts
  const instanceDatesForCheck = useMemo(() => getInstanceDates(), [form.event_date, form.recurrence, form.num_instances]);
  const { data: courtConflicts } = useQuery({
    queryKey: ["court-conflicts", form.court_ids, instanceDatesForCheck, form.start_time, form.end_time],
    queryFn: async () => {
      if (form.court_ids.length === 0 || instanceDatesForCheck.length === 0) return [];
      const { data, error } = await supabase
        .from("bookings")
        .select("id, court_id, date, start_time, end_time, guest_name, status")
        .in("court_id", form.court_ids)
        .in("date", instanceDatesForCheck)
        .eq("status", "active")
        .lt("start_time", form.end_time + ":00")
        .gt("end_time", form.start_time + ":00");
      if (error) throw error;
      return data || [];
    },
    enabled: form.court_ids.length > 0 && instanceDatesForCheck.length > 0 && step >= 2,
  });

  /**
   * Booking allowance.
   * - Admins (or members with booking/event permissions): unlimited courts, any
   *   time, any number of occurrences — booked under the club, free.
   * - Ordinary members: 1 peak-hour court slot + 1 off-peak court slot per
   *   occurrence, booked in their own name.
   */
  const bookingLimit = useMemo(() => {
    if (adminBypass) return { ok: true as const, message: "" };
    const split = splitPeakMinutes(club, form.event_date, form.start_time, form.end_time);
    const courtsCount = form.court_ids.length;
    if (courtsCount > 1) {
      return {
        ok: false as const,
        message:
          "Members can book 1 peak-hour and 1 off-peak court per event occurrence. Please select a single court, or ask a club admin to create this event.",
      };
    }
    if (split.peak > 60) {
      return {
        ok: false as const,
        message: `Peak hours are ${split.peakLabel}. Members may book a maximum of 1 hour during peak. Shorten the event or move it outside peak hours.`,
      };
    }
    if (split.offPeak > 60) {
      return {
        ok: false as const,
        message: "Members may book a maximum of 1 hour outside peak time. Shorten the event or ask a club admin to create it.",
      };
    }
    return { ok: true as const, message: "" };
  }, [adminBypass, club, form.event_date, form.start_time, form.end_time, form.court_ids.length]);



  // Determine members to invite based on scope
  const getInviteeIds = async (): Promise<string[]> => {
    if (!clubId) return [];
    if (form.invite_scope === "none") return [];
    if (form.invite_scope === "selected") {
      return form.selected_member_ids;
    }
    if (form.invite_scope === "all") {
      const { data } = await supabase.from("club_members").select("id").eq("club_id", clubId);
      return (data || []).map((m) => m.id);
    }
    if (form.invite_scope === "category" && form.invite_scope_id) {
      // Use the (possibly edited) checklist selection
      if (form.selected_member_ids.length > 0) return form.selected_member_ids;
      const { data } = await supabase.from("club_members").select("id").eq("club_id", clubId).eq("fee_category_id", form.invite_scope_id);
      return (data || []).map((m) => m.id);
    }
    if (form.invite_scope === "league" && form.invite_scope_id) {
      if (form.selected_member_ids.length > 0) return form.selected_member_ids;
      const { data } = await fromExt("member_league_registrations").select("club_member_id").eq("league_id", form.invite_scope_id);
      return (data || []).map((m: any) => m.club_member_id);
    }
    return [];
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user || !clubId) throw new Error("Not authenticated");
      if (!form.title.trim()) throw new Error("Title is required");
      if (form.court_ids.length === 0) throw new Error("Select at least one court");
      if (!bookingLimit.ok) throw new Error(bookingLimit.message);


      // Enforce per-member monthly event cap (admins exempt)
      if (!adminBypass && !editingEventId) {
        const maxPerMonth = Number((club as any)?.max_member_events_per_month ?? 2);
        if (maxPerMonth <= 0) {
          throw new Error("Members are not allowed to create events at this club. Please contact an admin.");
        }
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const { count } = await (supabase as any)
          .from("club_events")
          .select("id", { count: "exact", head: true })
          .eq("club_id", clubId)
          .eq("created_by", user.id)
          .neq("status", "cancelled")
          .gte("created_at", monthStart);
        if ((count ?? 0) >= maxPerMonth) {
          throw new Error(`Monthly event limit reached (max ${maxPerMonth} per month). Please ask an admin to create more.`);
        }
      }

      const dayOfWeek = new Date(form.event_date + "T00:00:00").getDay();

      // Create event
      const { data: event, error: eventError } = await fromExt("club_events").insert({
        club_id: clubId,
        created_by: user.id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        event_type: form.event_type,
        day_of_week: dayOfWeek,
        start_time: form.start_time + ":00",
        end_time: form.end_time + ":00",
        start_date: form.event_date,
        invite_scope: form.invite_scope,
        invite_scope_id: form.invite_scope_id || null,
        is_club_booking: adminBypass,
        booked_by_member_id: null,
        recurrence: form.recurrence,
        light_fee_split: form.light_fee_split,
        reminder_hours: parseInt(form.reminder_hours),
        num_instances: form.recurrence === "once" ? 1 : form.num_instances,
      }).select("id").single();
      if (eventError) throw eventError;

      const eventId = event.id;

      // Insert courts
      const courtRows = form.court_ids.map((cid) => ({ event_id: eventId, court_id: cid }));
      const { error: courtError } = await fromExt("club_event_courts").insert(courtRows);
      if (courtError) throw courtError;

      // Create instances
      const instanceDates = getInstanceDates();
      const instanceRows = instanceDates.map((d) => ({
        event_id: eventId,
        instance_date: d,
        status: "scheduled",
      }));
      const { data: instances, error: instError } = await fromExt("club_event_instances")
        .insert(instanceRows)
        .select("id, instance_date");
      if (instError) throw instError;

      // Invite members - create RSVPs for both event-level and first instance.
      // RSVP inserts can be heavy (members × instances) and fire DB triggers per row,
      // so we run them in the background and let the dialog close as soon as the
      // event + bookings are saved.
      const inviteeIds = await getInviteeIds();

      if (inviteeIds.length > 0) {
        (async () => {
          try {
            const eventRsvpRows = inviteeIds.map((mid) => ({
              event_id: eventId,
              club_member_id: mid,
              status: "invited",
            }));
            for (let i = 0; i < eventRsvpRows.length; i += 500) {
              await fromExt("club_event_rsvps").insert(eventRsvpRows.slice(i, i + 500));
            }
            if (instances && instances.length > 0) {
              const allInstanceRows: any[] = [];
              for (const inst of instances) {
                for (const mid of inviteeIds) {
                  allInstanceRows.push({ instance_id: inst.id, club_member_id: mid, status: "invited" });
                }
              }
              for (let i = 0; i < allInstanceRows.length; i += 500) {
                await fromExt("club_event_instance_rsvps").insert(allInstanceRows.slice(i, i + 500));
              }
            }
            queryClient.invalidateQueries({ queryKey: ["club-event-rsvps-counts"] });
          } catch (rsvpErr) {
            console.warn("[CreateClubEvent] RSVP insert failed (non-blocking):", rsvpErr);
          }
        })();
      }

      // Create court bookings for every event instance.
      // Admin events are booked under the club (free). Member events are booked
      // in the member's own name and are capped at 1 peak + 1 off-peak slot.
      const bookingRows: any[] = [];
      const bookAsClub = adminBypass;
      const eventBookingTitle = bookAsClub
        ? `${club?.name || "Club"} — ${form.title.trim()}`
        : form.title.trim();

      for (const date of instanceDates) {
        for (const cid of form.court_ids) {
          bookingRows.push({
            court_id: cid,
            date,
            start_time: form.start_time + ":00",
            end_time: form.end_time + ":00",
            user_id: user.id,
            ...(bookAsClub ? {} : { club_member_id: activeMember?.id || null }),
            guest_name: eventBookingTitle,
            lights_requested: form.lights_auto_on,
            status: "active",
            club_id: clubId,
            source: "club_event",
          });
        }
      }


      if (bookingRows.length > 0) {
        const { error: bookingError } = await supabase.from("bookings").insert(bookingRows as any);
        if (bookingError) {
          // A single clashing slot fails the whole bulk insert — retry one by
          // one so the event still blocks every court it can.
          const failures: BookingFailure[] = [];
          for (const row of bookingRows) {
            const { error: rowErr } = await supabase.from("bookings").insert(row as any);
            if (rowErr) failures.push({ row, message: rowErr.message });
          }
          const courtNames = (courts || []).reduce(
            (acc, c) => ({ ...acc, [c.id]: c.name }),
            {} as Record<number, string>,
          );
          reportBookingFailures(failures, bookingRows.length, courtNames);
        }
      }



      // Push bookings to GoBook if the club uses it. This mirrors the per-slot
      // booking flow on the Bookings page so events created via this wizard
      // also reach gobook.co.za (otherwise they only exist locally).
      try {
        const { data: clubInfo } = await fromExt("clubs")
          .select("uses_gobook, booking_slot_minutes")
          .eq("id", clubId)
          .maybeSingle();
        if (
          clubInfo?.uses_gobook &&
          (clubInfo.booking_slot_minutes ?? 60) === 60 &&
          bookingRows.length > 0
        ) {
          const courtNumberById = new Map<number, number>();
          for (const c of (courts || [])) {
            const n = Number(String((c as any).name || "").match(/(\d+)/)?.[1] || 0);
            courtNumberById.set((c as any).id, n);
          }
          const notesBase = form.title.trim().slice(0, 200);
          let attempted = 0;
          const failures: string[] = [];
          for (const row of bookingRows) {
            const memberIdForPush = adminBypass
              ? (activeMember?.id || null)
              : (row.club_member_id || null);
            if (!memberIdForPush) {
              failures.push(`${row.date} ${row.start_time}: no member to book under`);
              continue;
            }
            const startH = parseInt(String(row.start_time).split(":")[0]);
            const endH = parseInt(String(row.end_time).split(":")[0]);
            const courtNum = courtNumberById.get(row.court_id) || 0;
            for (let h = startH; h < endH; h++) {
              attempted++;
              try {
                const { data: gbData, error: gbErr } = await supabase.functions.invoke("gobook-book", {
                  body: {
                    action: "book",
                    club_member_id: memberIdForPush,
                    date: row.date,
                    start_hour: h,
                    court: courtNum || "any",
                    notes: notesBase,
                    sms: false,
                    email: false,
                  },
                });
                const msg = (gbData && (gbData as any).error) || gbErr?.message;
                if (msg) failures.push(`${row.date} ${String(h).padStart(2, "0")}:00 court ${courtNum || "any"}: ${msg}`);
              } catch (e: any) {
                failures.push(`${row.date} ${String(h).padStart(2, "0")}:00 court ${courtNum || "any"}: ${e?.message || "unknown"}`);
              }
            }
          }
          if (attempted > 0) {
            if (failures.length === 0) {
              toast.success(`Pushed ${attempted} booking${attempted === 1 ? "" : "s"} to GoBook.`);
            } else if (failures.length < attempted) {
              toast.warning(`GoBook: ${attempted - failures.length}/${attempted} pushed. ${failures.length} failed — check GoBook credentials.`);
              console.warn("[CreateClubEvent] GoBook push failures:", failures);
            } else {
              toast.error(`Event saved locally, but GoBook rejected all ${attempted} bookings. Check GoBook credentials in My Account.`);
              console.warn("[CreateClubEvent] GoBook push failures:", failures);
            }
          }
        }
      } catch (gbWrapErr) {
        console.warn("[CreateClubEvent] GoBook push wrapper failed (non-blocking):", gbWrapErr);
        toast.warning("Event saved, but pushing to GoBook failed. Please verify on gobook.co.za.");
      }



      // Notifications — fire-and-forget. Each row triggers email + web-push
      // delivery functions, so we don't make the user wait for ~200 trigger
      // executions. Errors are non-blocking.
      if (inviteeIds.length > 0 && (form.notify_push || form.notify_email)) {
        (async () => {
          try {
            const { data: memberData } = await supabase
              .from("club_members")
              .select("id, user_id")
              .in("id", inviteeIds);
            const recurrenceText = form.recurrence === "once"
              ? `on ${format(new Date(form.event_date), "EEE d MMM")}`
              : `${form.recurrence} from ${format(new Date(form.event_date), "EEE d MMM")}`;
            const notifRows = (memberData || []).map((m) => ({
              user_id: m.user_id || "00000000-0000-0000-0000-000000000000",
              club_member_id: m.id,
              title: `📅 ${form.event_type.charAt(0).toUpperCase() + form.event_type.slice(1)} Event Invitation`,
              message: `You're invited to "${form.title}" ${recurrenceText} at ${form.start_time}. Please confirm or decline.`,
              type: "booking",
              url: `/events`,
              data: JSON.stringify({
                event_id: eventId,
                suppress_email: form.notify_email ? "false" : "true",
                suppress_push: form.notify_push ? "false" : "true",
              }),
            }));
            if (notifRows.length > 0) {
              // Chunk so a single insert doesn't kick off 200 triggers at once.
              for (let i = 0; i < notifRows.length; i += 50) {
                await fromExt("notifications").insert(notifRows.slice(i, i + 50));
              }
            }
          } catch (notifErr) {
            console.warn("[CreateClubEvent] Notification insert failed (non-blocking):", notifErr);
          }
        })();
      }

      // WhatsApp invites — opt-in channel, billed per message to the club.
      // Each recipient gets a Yes/No question whose reply is written back into
      // club_event_rsvps by the whatsapp-inbound webhook.
      // Only club admins may spend club WhatsApp credit; members share from
      // their own number via the wa.me link instead.
      if (inviteeIds.length > 0 && form.notify_whatsapp && canUseClubWhatsApp && clubId) {
        (async () => {
          try {
            const whenText = form.recurrence === "once"
              ? `on ${format(new Date(form.event_date), "EEE d MMM")}`
              : `${form.recurrence} from ${format(new Date(form.event_date), "EEE d MMM")}`;
            await sendWhatsApp({
              clubId,
              recipients: inviteeIds.map((id) => ({ member_id: id })),
              kind: "event_invite",
              category: "utility",
              templateKey: "rsvp_question",
              templateVariables: {
                question: `You're invited to "${form.title}" ${whenText} at ${form.start_time}.`,
                details: "Reply YES to confirm or NO to decline.",
              },
              body: `You're invited to "${form.title}" ${whenText} at ${form.start_time}.\n\nReply YES to confirm or NO to decline.`,
              interaction: {
                kind: "event_rsvp",
                targetId: eventId,
                prompt: `RSVP for ${form.title}`,
              },
            });
          } catch (waErr) {
            console.warn("[CreateClubEvent] WhatsApp invite failed (non-blocking):", waErr);
          }
        })();
      }

      return eventId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club-events"] });
      queryClient.invalidateQueries({ queryKey: ["club-event-rsvps-counts"] });
      queryClient.invalidateQueries({ queryKey: ["club-events-list"] });
      toast.success("Event created and members invited!");
      setCreateOpen(false);
      resetForm();
      onClose?.();
    },
    onError: (err: any) => toast.error(err.message || "Failed to create event"),
  });

  const respondMutation = useMutation({
    mutationFn: async ({ rsvpId, status }: { rsvpId: string; status: string }) => {
      const { error } = await fromExt("club_event_rsvps").update({ status, updated_at: new Date().toISOString() }).eq("id", rsvpId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club-event-my-rsvps"] });
      queryClient.invalidateQueries({ queryKey: ["club-event-rsvps-data"] });
      toast.success("RSVP updated");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ eventId, cancelBookings }: { eventId: string; cancelBookings: boolean }) => {
      // Get event details to find associated bookings
      const { data: evt } = await fromExt("club_events")
        .select("club_id, start_time, end_time, start_date")
        .eq("id", eventId)
        .single();

      // Get courts linked to this event
      const { data: eventCourts } = await fromExt("club_event_courts")
        .select("court_id")
        .eq("event_id", eventId);

      // Get all instance dates
      const { data: instances } = await fromExt("club_event_instances")
        .select("instance_date")
        .eq("event_id", eventId);

      // Cancel matching bookings for all instance dates and courts
      let cancelledCount = 0;
      let cancelError: string | null = null;
      if (cancelBookings && evt && eventCourts?.length && instances?.length) {
        const courtIds = eventCourts.map((c: any) => c.court_id);
        const dates: string[] = Array.from(
          new Set((instances as any[]).map((i: any) => String(i.instance_date))),
        );

        for (const date of dates) {
          // Overlap match: a booking counts if it starts before the event ends
          // and ends after the event starts (handles per-hour split bookings).
          const { data: removed, error: updErr } = await supabase
            .from("bookings")
            .update({ status: "cancelled" })
            .in("court_id", courtIds)
            .eq("date", date)
            .eq("status", "active")
            .lt("start_time", evt.end_time)
            .gt("end_time", evt.start_time)
            .select("id");
          if (updErr) cancelError = updErr.message;
          cancelledCount += removed?.length || 0;
        }
      }


      // Cancel the event
      const { error } = await fromExt("club_events").update({ status: "cancelled" }).eq("id", eventId);
      if (error) throw error;
      return { cancelBookings, cancelledCount, cancelError };
    },
    onSuccess: ({ cancelBookings, cancelledCount, cancelError }) => {
      queryClient.invalidateQueries({ queryKey: ["club-events"] });
      queryClient.invalidateQueries({ queryKey: ["club-events-list"] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["club-event-booking-coverage"] });
      if (cancelBookings && cancelledCount === 0) {
        toast.warning("Event deleted — no court bookings were cancelled", {
          description:
            cancelError ||
            "No active bookings matched this event's courts, dates and times. Check the Bookings page and cancel them manually if needed.",
          duration: 12000,
        });
        return;
      }
      toast.success(
        cancelBookings
          ? `Event deleted — ${cancelledCount} court booking${cancelledCount === 1 ? "" : "s"} cancelled`
          : "Event deleted — court bookings kept",
      );
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete event"),
  });


  // Start editing an event — pre-fill form
  const startEdit = (e: any) => {
    const courtIds = (e.club_event_courts || []).map((c: any) => c.court_id);
    setEditingEventId(e.id);
    setForm({
      title: e.title || "",
      description: e.description || "",
      event_type: e.event_type || "social",
      event_date: e.start_date || format(new Date(), "yyyy-MM-dd"),
      start_time: String(e.start_time).slice(0, 5),
      end_time: String(e.end_time).slice(0, 5),
      recurrence: e.recurrence || "once",
      num_instances: e.num_instances || 12,
      reminder_hours: String(e.reminder_hours || 48),
      invite_scope: e.invite_scope || "all",
      invite_scope_id: e.invite_scope_id || "",
      selected_member_ids: [],
      notify_push: true,
      notify_email: true,
      notify_whatsapp: false,
      light_fee_split: e.light_fee_split || "creator",
      is_club_booking: e.is_club_booking || false,
      booking_member_ids: [],
      court_ids: courtIds,
      lights_auto_on: false,
    });
    setStep(1);
    setCreateOpen(true);
  };

  // Edit mutation — update event and rebook courts if times/courts changed
  const editMutation = useMutation({
    mutationFn: async () => {
      if (!user || !clubId || !editingEventId) throw new Error("Not authenticated");
      if (!form.title.trim()) throw new Error("Title is required");
      if (form.court_ids.length === 0) throw new Error("Select at least one court");
      if (!bookingLimit.ok) throw new Error(bookingLimit.message);

      const dayOfWeek = new Date(form.event_date + "T00:00:00").getDay();

      // Get old event for comparison
      const { data: oldEvent } = await fromExt("club_events")
        .select("start_time, end_time, start_date, title, is_club_booking")
        .eq("id", editingEventId)
        .single();
      const { data: oldCourts } = await fromExt("club_event_courts")
        .select("court_id")
        .eq("event_id", editingEventId);
      const oldCourtIds = (oldCourts || []).map((c: any) => c.court_id);

      // Update event record
      const { error: updateErr } = await fromExt("club_events").update({
        title: form.title.trim(),
        description: form.description.trim() || null,
        event_type: form.event_type,
        day_of_week: dayOfWeek,
        start_time: form.start_time + ":00",
        end_time: form.end_time + ":00",
        start_date: form.event_date,
        invite_scope: form.invite_scope,
        invite_scope_id: form.invite_scope_id || null,
        is_club_booking: adminBypass,
        recurrence: form.recurrence,
        light_fee_split: form.light_fee_split,
        reminder_hours: parseInt(form.reminder_hours),
        num_instances: form.recurrence === "once" ? 1 : form.num_instances,
        updated_at: new Date().toISOString(),
      }).eq("id", editingEventId);
      if (updateErr) throw updateErr;

      // Update courts if changed
      const courtsChanged = JSON.stringify([...oldCourtIds].sort()) !== JSON.stringify([...form.court_ids].sort());
      if (courtsChanged) {
        await fromExt("club_event_courts").delete().eq("event_id", editingEventId);
        const courtRows = form.court_ids.map((cid) => ({ event_id: editingEventId, court_id: cid }));
        await fromExt("club_event_courts").insert(courtRows);
      }

      // Check if times or courts changed — rebook if so
      const timesChanged = oldEvent &&
        (oldEvent.start_time !== form.start_time + ":00" ||
         oldEvent.end_time !== form.end_time + ":00" ||
         oldEvent.start_date !== form.event_date ||
         oldEvent.title !== form.title.trim() ||
         oldEvent.is_club_booking !== adminBypass);

      if (timesChanged || courtsChanged) {
        // Only ever touch today's and future occurrences — past bookings are history.
        const todayStr = new Date().toLocaleDateString("en-CA");

        // Get all instance dates
        const { data: instances } = await fromExt("club_event_instances")
          .select("instance_date")
          .eq("event_id", editingEventId);

        // Cancel old bookings on old courts/times (future dates only)
        if (oldEvent && oldCourtIds.length && instances?.length) {
          const dates = instances
            .map((i: any) => i.instance_date)
            .filter((d: string) => d >= todayStr);
          for (const date of dates) {
            await supabase
              .from("bookings")
              .update({ status: "cancelled" })
              .in("court_id", [...new Set([...oldCourtIds, ...form.court_ids])])
              .eq("date", date)
              .gte("start_time", oldEvent.start_time)
              .lte("end_time", oldEvent.end_time);
          }
        }


        // Update instance dates if start date changed
        if (oldEvent?.start_date !== form.event_date && instances?.length) {
          // Delete old instances and recreate
          await fromExt("club_event_instances").delete().eq("event_id", editingEventId);
          const instanceDates = getInstanceDates();
          const instanceRows = instanceDates.map((d) => ({
            event_id: editingEventId,
            instance_date: d,
            status: "scheduled",
          }));
          await fromExt("club_event_instances").insert(instanceRows);
        }

        // Recreate bookings for every UPCOMING instance date (never past dates)
        // so recurring events keep their courts blocked.
        const { data: freshInstances } = await fromExt("club_event_instances")
          .select("instance_date")
          .eq("event_id", editingEventId);
        const rebookDates: string[] = (
          freshInstances?.length
            ? freshInstances.map((i: any) => i.instance_date)
            : [form.event_date]
        ).filter((d: string) => d >= todayStr);

        const rebookRows: any[] = [];
        const rebookAsClub = adminBypass;

        for (const date of rebookDates) {
          for (const cid of form.court_ids) {
            rebookRows.push({
              court_id: cid,
              date,
              start_time: form.start_time + ":00",
              end_time: form.end_time + ":00",
              user_id: user.id,
              ...(rebookAsClub ? {} : { club_member_id: activeMember?.id || null }),
              guest_name: rebookAsClub
                ? `${club?.name || "Club"} — ${form.title.trim()}`
                : form.title.trim(),
              lights_requested: form.lights_auto_on,
              status: "active",
              club_id: clubId,
              source: "club_event",
            });
          }
        }


        if (rebookRows.length > 0) {
          // Insert row-by-row so one clashing slot (unique index on
          // court/date/start_time) doesn't wipe out the whole rebooking.
          const failures: BookingFailure[] = [];
          for (const row of rebookRows) {
            const { error: reErr } = await supabase.from("bookings").insert(row as any);
            if (reErr) failures.push({ row, message: reErr.message });
          }
          const courtNames = (courts || []).reduce(
            (acc, c) => ({ ...acc, [c.id]: c.name }),
            {} as Record<number, string>,
          );
          reportBookingFailures(failures, rebookRows.length, courtNames);
        }


      }

      return editingEventId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club-events"] });
      queryClient.invalidateQueries({ queryKey: ["club-events-list"] });
      toast.success("Event updated!");
      setCreateOpen(false);
      setEditingEventId(null);
      resetForm();
      onClose?.();
    },
    onError: (err: any) => toast.error(err.message || "Failed to update event"),
  });

  const resetForm = () => {
    const selfId = activeMember?.id;
    setEditingEventId(null);
    setForm({
      title: "",
      description: "",
      event_type: "social",
      event_date: format(new Date(), "yyyy-MM-dd"),
      start_time: "18:00",
      end_time: "19:00",
      recurrence: "once",
      num_instances: 12,
      reminder_hours: "48",
      invite_scope: "all",
      invite_scope_id: "",
      selected_member_ids: selfId ? [selfId] : [],
      notify_push: true,
      notify_email: true,
      notify_whatsapp: false,
      light_fee_split: "creator",
      is_club_booking: false,
      booking_member_ids: selfId ? [selfId] : [],
      court_ids: [],
      lights_auto_on: false,
    });
    setStep(1);
  };

  const toggleCourt = (courtId: number) => {
    setForm((f) => ({
      ...f,
      court_ids: f.court_ids.includes(courtId)
        ? f.court_ids.filter((id) => id !== courtId)
        : [...f.court_ids, courtId],
    }));
  };

  const toggleSelectedMember = (memberId: string) => {
    // Don't allow deselecting the organizer
    if (memberId === activeMember?.id) return;
    setForm((f) => ({
      ...f,
      selected_member_ids: f.selected_member_ids.includes(memberId)
        ? f.selected_member_ids.filter((id) => id !== memberId)
        : [...f.selected_member_ids, memberId],
    }));
  };

  const canGoStep2 = form.event_date && form.start_time && form.end_time;
  const canGoStep3 = !!form.title.trim() && form.court_ids.length > 0 && bookingLimit.ok;

  return (
    <div className="space-y-3">
      {!onClose && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarPlus className="w-4 h-4 text-primary" />
            <p className="text-xs font-semibold font-heading">Club Events</p>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" aria-label="What are club events?" className="text-muted-foreground hover:text-foreground">
                  <Info className="w-3.5 h-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 text-xs space-y-2">
                <p className="font-semibold text-sm font-heading">What belongs here?</p>
                <p className="text-muted-foreground">
                  Club events are activities that need <strong>court bookings</strong> and an <strong>open invite</strong> to members. Typical examples:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                  <li>Weekly coaching or junior clinics</li>
                  <li>Club night / social play every week</li>
                  <li>Ladies' or beginners' evening</li>
                  <li>Fitness or training sessions</li>
                  <li>Braai, prize-giving or AGM</li>
                </ul>
                <p className="text-muted-foreground">
                  Club tournaments are <strong>not</strong> created here — set those up under Tournaments.
                </p>
              </PopoverContent>
            </Popover>
          </div>
          {canCreateEvents && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { resetForm(); setCreateOpen(true); }}>
              <CalendarPlus className="w-3 h-3" /> Create
            </Button>
          )}
        </div>
      )}


      {eventsLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        </div>
      ) : upcomingEvents && upcomingEvents.length > 0 ? (
        <div className="space-y-2">
          {upcomingEvents.map((e: any) => {
            const counts = rsvpCounts?.[e.id];
            const myRsvpList = myRsvps?.[e.id] || [];
            const courtNames = (e.club_event_courts || []).map((c: any) => (courts || []).find((ct: any) => ct.id === c.court_id)?.name || `Court ${c.court_id}`).join(", ");
            const isCreator = e.created_by === user?.id;
            const recLabel = e.recurrence && e.recurrence !== "once" ? e.recurrence : null;

            return (
              <Card key={e.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.start_date ? format(new Date(e.start_date + "T00:00:00"), "EEE d MMM yyyy") : DAYS[e.day_of_week]}
                        {recLabel ? ` · ${recLabel.charAt(0).toUpperCase() + recLabel.slice(1)}` : ""}
                        {" · "}{String(e.start_time).slice(0, 5)}–{String(e.end_time).slice(0, 5)}
                      </p>
                      {courtNames && <p className="text-[11px] text-muted-foreground">{courtNames}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="secondary" className="text-[9px] capitalize">{e.event_type}</Badge>
                      {e.is_club_booking && <Badge variant="outline" className="text-[9px]">Club</Badge>}
                    </div>
                  </div>

                  {e.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{e.description}</p>
                  )}

                  {/* Confirmed member names */}
                  {confirmedNames?.[e.id]?.length > 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">Confirmed:</span>{" "}
                      {confirmedNames[e.id].join(", ")}
                    </div>
                  )}

                  {/* Declined member names */}
                  {declinedNames?.[e.id]?.length > 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-destructive">Declined ({declinedNames[e.id].length}):</span>{" "}
                      {declinedNames[e.id].join(", ")}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] text-muted-foreground">
                      {counts ? `${counts.confirmed} confirmed · ${counts.declined} declined · ${counts.invited} pending` : "No RSVPs yet"}

                      {e.light_fee_split === "attendees" && (
                        <span className="ml-1">· Lights shared</span>
                      )}
                      {(() => {
                        const cov = bookingCoverage?.[e.id];
                        if (!cov || cov.total === 0) return null;
                        if (cov.booked === 0)
                          return <span className="ml-1 text-destructive">· No courts booked</span>;
                        if (cov.booked < cov.total)
                          return <span className="ml-1 text-destructive">· {cov.booked}/{cov.total} courts booked</span>;
                        return <span className="ml-1">· {cov.booked} court slots booked</span>;
                      })()}
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Show confirm/decline for each linked member with pending invite */}
                      {myRsvpList.filter(r => r.status === "invited").map(r => (
                        <span key={r.id} className="inline-flex items-center gap-0.5">
                          {linkedMembers.length > 1 && (
                            <span className="text-[9px] text-muted-foreground mr-0.5">{r.memberName}:</span>
                          )}
                          <Button
                            size="sm"
                            variant="default"
                            className="h-6 text-[10px] px-2"
                            onClick={() => respondMutation.mutate({ rsvpId: r.id, status: "confirmed" })}
                          >
                            <Check className="w-3 h-3 mr-0.5" /> Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2"
                            onClick={() => respondMutation.mutate({ rsvpId: r.id, status: "declined" })}
                          >
                            <X className="w-3 h-3 mr-0.5" /> Decline
                          </Button>
                        </span>
                      ))}
                      {/* Show status badges for already-responded members */}
                      {myRsvpList.filter(r => r.status !== "invited").map(r => (
                        <Badge key={r.id} variant={r.status === "confirmed" ? "default" : "outline"} className="text-[9px] capitalize">
                          {linkedMembers.length > 1 ? `${r.memberName}: ${r.status}` : r.status}
                        </Badge>
                      ))}
                      {(isCreator || isAdmin) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => startEdit(e)}
                        >
                          <Pencil className="w-3 h-3 text-muted-foreground" />
                        </Button>
                      )}
                      {(isCreator || isAdmin) && (
                        <AlertDialog onOpenChange={(o) => { if (o) setDeleteBookings(true); }}>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-6 w-6">
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Event</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will cancel "{e.title}". Choose whether the court bookings made for this event
                                should be cancelled too. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <label className="flex items-start gap-2 rounded-md border border-border p-2.5 cursor-pointer">
                              <Checkbox
                                checked={deleteBookings}
                                onCheckedChange={(v) => setDeleteBookings(!!v)}
                                className="mt-0.5"
                              />
                              <span className="text-xs">
                                Also cancel the court bookings for this event
                                <span className="block text-[11px] text-muted-foreground">
                                  Leave unticked to free the event but keep the courts booked.
                                </span>
                              </span>
                            </label>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep Event</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => cancelMutation.mutate({ eventId: e.id, cancelBookings: deleteBookings })}
                              >
                                Delete Event
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-4 text-center">
          <p className="text-xs text-muted-foreground">No active club events yet.</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Use events for coaching sessions, weekly club nights, socials or training that need courts booked and members invited. Club tournaments are created under Tournaments.
          </p>

        </Card>
      )}

      {/* Create Event Dialog - Multi-step */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editingEventId ? "Edit Event" : "Create Event"}
              <span className="text-xs font-normal text-muted-foreground ml-2">Step {step} of 3</span>
            </DialogTitle>
          </DialogHeader>

          {/* Step indicators */}
          <div className="flex gap-1 mb-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  s <= step ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>

          {/* STEP 1: Date, Time & Recurrence */}
          {step === 1 && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Event Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start font-normal"
                    >
                      <CalendarPlus className="w-4 h-4 mr-2 text-muted-foreground" />
                      {form.event_date
                        ? format(new Date(form.event_date + "T00:00:00"), "EEE d MMM yyyy")
                        : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <CalendarPicker
                      mode="single"
                      selected={form.event_date ? new Date(form.event_date + "T00:00:00") : undefined}
                      defaultMonth={form.event_date ? new Date(form.event_date + "T00:00:00") : undefined}
                      onSelect={(d) => {
                        if (!d) return;
                        setForm((f) => ({ ...f, event_date: format(d, "yyyy-MM-dd") }));
                      }}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>


              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Start Time</Label>
                  <Select value={form.start_time} onValueChange={(v) => setForm((f) => ({ ...f, start_time: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">End Time</Label>
                  <Select value={form.end_time} onValueChange={(v) => setForm((f) => ({ ...f, end_time: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Repeat</Label>
                <Select value={form.recurrence} onValueChange={(v) => setForm((f) => ({ ...f, recurrence: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.recurrence !== "once" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Number of occurrences</Label>
                  <Select
                    value={String(form.num_instances)}
                    onValueChange={(v) => setForm((f) => ({ ...f, num_instances: parseInt(v) }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[4, 8, 12, 24, 52].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} occurrences</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {form.recurrence === "weekly" && `Every ${DAYS[new Date(form.event_date + "T00:00:00").getDay()]} for ${form.num_instances} weeks`}
                    {form.recurrence === "monthly" && `Same day each month for ${form.num_instances} months`}
                    {form.recurrence === "yearly" && `Same date each year for ${form.num_instances} years`}
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Reminder</Label>
                <Select value={form.reminder_hours} onValueChange={(v) => setForm((f) => ({ ...f, reminder_hours: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REMINDER_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* STEP 2: Event Details, Courts & Booking */}
          {step === 2 && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Friday Social Night"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Description (optional)</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="min-h-[60px]"
                  placeholder="Details about the event..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Event Type</Label>
                <Select
                  value={form.event_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, event_type: v }))}
                >

                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.filter((t) => !t.adminOnly || isAdmin).map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Courts</Label>
                <div className="flex flex-wrap gap-2">
                  {(courts || []).map((c) => (
                    <Button
                      key={c.id}
                      type="button"
                      size="sm"
                      variant={form.court_ids.includes(c.id) ? "default" : "outline"}
                      className="h-8 text-xs"
                      onClick={() => toggleCourt(c.id)}
                    >
                      {c.name}
                    </Button>
                  ))}
                </div>
                {adminBypass ? (
                  <p className="text-[11px] text-muted-foreground">
                    Booked under {club?.name || "the club"} — free, no booking limits.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Members may book 1 peak-hour and 1 off-peak court slot per occurrence.
                  </p>
                )}
                {!bookingLimit.ok && (
                  <p className="text-[11px] text-destructive">{bookingLimit.message}</p>
                )}
              </div>


              </div>
          )}


          {/* STEP 3: Invites & Light Fees */}
          {step === 3 && (
            <div className="space-y-4 py-2">
              {/* Invite Scope */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Invite</Label>
                <Select value={form.invite_scope} onValueChange={(v) => setForm((f) => ({ ...f, invite_scope: v, invite_scope_id: "", selected_member_ids: [] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Members</SelectItem>
                    <SelectItem value="category">By Fee Category</SelectItem>
                    <SelectItem value="league">By League</SelectItem>
                    <SelectItem value="selected">Selected Members</SelectItem>
                    <SelectItem value="none">No invitation</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Notification channels */}
              {form.invite_scope !== "none" && (
                <div className="space-y-2 rounded-md border p-3">
                  <Label className="text-xs font-medium">Notify invitees via</Label>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="notify-push" className="text-xs font-normal cursor-pointer">
                      Push notification
                    </Label>
                    <Switch
                      id="notify-push"
                      checked={form.notify_push}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, notify_push: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="notify-email" className="text-xs font-normal cursor-pointer">
                      Email invite
                    </Label>
                    <Switch
                      id="notify-email"
                      checked={form.notify_email}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, notify_email: v }))}
                    />
                  </div>
                  {canUseClubWhatsApp ? (
                    <div className="flex items-center justify-between">
                      <Label htmlFor="notify-whatsapp" className="text-xs font-normal cursor-pointer">
                        WhatsApp invite <span className="text-muted-foreground">(Yes/No reply)</span>
                      </Label>
                      <Switch
                        id="notify-whatsapp"
                        checked={form.notify_whatsapp}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, notify_whatsapp: v }))}
                      />
                    </div>
                  ) : adminBypass ? (
                    <div
                      className="flex items-center justify-between"
                      title="WhatsApp messaging is not activated for your club. Activate it in Club Admin → WhatsApp."
                    >
                      <span className="text-xs font-normal text-muted-foreground">
                        WhatsApp invite{" "}
                        <a
                          href="/club-admin?tab=whatsapp"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline text-primary"
                        >
                          Activate
                        </a>
                      </span>
                      <Switch checked={false} disabled />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-normal text-muted-foreground">
                        WhatsApp invite <span className="text-[11px]">(from your own number)</span>
                      </span>
                      <button
                        type="button"
                        className="text-xs underline text-primary shrink-0"
                        onClick={() => window.open(buildOwnWhatsAppShareUrl(), "_blank", "noopener")}
                      >
                        Share
                      </button>
                    </div>
                  )}
                  {!form.notify_push && !form.notify_email && !form.notify_whatsapp && (
                    <p className="text-[11px] text-muted-foreground">
                      Invitees will still see the event in-app but won't be notified.
                    </p>
                  )}
                  {!adminBypass && (
                    <p className="text-[11px] text-muted-foreground">
                      Club-billed WhatsApp invites are admin-only. "Share" opens WhatsApp on your device so
                      you can send the invite yourself — no cost to the club.
                    </p>
                  )}
                  {form.notify_whatsapp && (
                    <p className="text-[11px] text-muted-foreground">
                      WhatsApp messages are billed to your club. Replies update the RSVP automatically.
                    </p>
                  )}
                </div>
              )}


              {form.invite_scope === "category" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Select value={form.invite_scope_id} onValueChange={(v) => setForm((f) => ({ ...f, invite_scope_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {(feeCategories || []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.invite_scope === "league" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">League</Label>
                  <Select value={form.invite_scope_id} onValueChange={(v) => setForm((f) => ({ ...f, invite_scope_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select league" /></SelectTrigger>
                    <SelectContent>
                      {(leagues || []).map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(form.invite_scope === "selected"
                || (form.invite_scope === "league" && form.invite_scope_id)
                || (form.invite_scope === "category" && form.invite_scope_id)) && (
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {form.invite_scope === "league"
                      ? `League members (${form.selected_member_ids.length} selected — untick to exclude)`
                      : form.invite_scope === "category"
                      ? `Category members (${form.selected_member_ids.length} selected — untick to exclude)`
                      : `Select Members (${form.selected_member_ids.length} selected)`}
                  </Label>
                  <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2 space-y-1">
                    {(members || []).map((m) => (
                      <label
                        key={m.id}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent/50 transition-colors text-sm",
                          form.selected_member_ids.includes(m.id) && "bg-accent"
                        )}
                      >
                        <Checkbox
                          checked={form.selected_member_ids.includes(m.id)}
                          onCheckedChange={() => toggleSelectedMember(m.id)}
                        />
                        <span className="text-xs">{m.name || "Unnamed"}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Court Availability Warning */}
              {courtConflicts && courtConflicts.length > 0 && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 space-y-1.5">
                  <p className="text-xs font-medium text-destructive">⚠ Court conflicts found</p>
                  <p className="text-[11px] text-muted-foreground">
                    The following courts already have bookings that overlap with your event times:
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {courtConflicts.map((c: any) => {
                      const courtName = (courts || []).find((ct) => ct.id === c.court_id)?.name || `Court ${c.court_id}`;
                      return (
                        <p key={c.id} className="text-[11px] text-destructive">
                          {courtName} · {c.date} · {String(c.start_time).slice(0, 5)}–{String(c.end_time).slice(0, 5)}
                          {c.guest_name ? ` (${c.guest_name})` : ""}
                        </p>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground italic">
                    You can still create the event, but the conflicting slots are already booked.
                  </p>
                </div>
              )}

              {/* Court booking summary — no toggles, the role decides */}
              <div className="rounded-lg border border-border p-3 space-y-2">
                <Label className="text-xs font-medium">Court booking</Label>
                {adminBypass ? (
                  <p className="text-[11px] text-muted-foreground">
                    Courts are booked under <strong>{club?.name || "the club"}</strong> — free, any time, any number of
                    courts and occurrences. The club carries any light fees.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Courts are booked in your name. Members may book <strong>1 peak-hour</strong> and{" "}
                    <strong>1 off-peak</strong> court slot per occurrence.
                  </p>
                )}
                {!bookingLimit.ok && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2">
                    <p className="text-[11px] text-destructive">{bookingLimit.message}</p>
                  </div>
                )}
              </div>


              {/* Light Fees */}
              <div className="rounded-lg border border-border p-3 space-y-2">
                <Label className="text-xs font-medium">Light Fees</Label>
                <p className="text-[11px] text-muted-foreground">Who pays for the court lights?</p>
                <Select value={form.light_fee_split} onValueChange={(v) => setForm((f) => ({ ...f, light_fee_split: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No fees (club covers)</SelectItem>
                    <SelectItem value="creator">Myself (event creator)</SelectItem>
                    <SelectItem value="attendees">Split equally among attendees</SelectItem>
                  </SelectContent>
                </Select>
                {form.light_fee_split === "attendees" && (
                  <p className="text-[11px] text-muted-foreground">
                    Light fees will be split equally among all confirmed attendees when the session ends.
                  </p>
                )}
                {form.light_fee_split === "none" && (
                  <p className="text-[11px] text-muted-foreground">
                    No light fees will be charged — the club covers the cost.
                  </p>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div>
                    <p className="text-xs font-medium">Auto switch on lights</p>
                    <p className="text-[11px] text-muted-foreground">Automatically turn on court lights at event start time</p>
                  </div>
                  <Switch
                    checked={form.lights_auto_on}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, lights_auto_on: v }))}
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <p className="text-xs font-medium">Summary</p>
                <p className="text-[11px] text-muted-foreground">
                  <strong>{form.title || "Untitled"}</strong> · {form.event_type}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {format(new Date(form.event_date + "T00:00:00"), "EEE d MMM yyyy")} · {form.start_time}–{form.end_time}
                </p>
                {form.recurrence !== "once" && (
                  <p className="text-[11px] text-muted-foreground">
                    Repeats {form.recurrence} × {form.num_instances} occurrences
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Courts: {form.court_ids.length} · Lights: {form.light_fee_split === "attendees" ? "Shared" : "Creator pays"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Booked under: {adminBypass ? `${club?.name || "Club"} (free)` : (activeMember?.name || "you")}
                </p>

                <p className="text-[11px] text-muted-foreground">
                  Reminder: {form.reminder_hours}h before each occurrence
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex-row gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="gap-1">
                <ChevronLeft className="w-3 h-3" /> Back
              </Button>
            )}
            <div className="flex-1" />
            {step === 1 && (
              <Button variant="outline" onClick={() => { setCreateOpen(false); onClose?.(); }}>Cancel</Button>
            )}
            {step < 3 ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={step === 1 ? !canGoStep2 : !canGoStep3}
                className="gap-1"
              >
                Next <ChevronRight className="w-3 h-3" />
              </Button>
            ) : (
              <Button
                onClick={() => editingEventId ? editMutation.mutate() : createMutation.mutate()}
                disabled={!bookingLimit.ok || (editingEventId ? editMutation.isPending : createMutation.isPending)}
              >
                {editingEventId
                  ? (editMutation.isPending ? "Saving..." : "Save Changes")
                  : (createMutation.isPending ? "Creating..." : "Create Event")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
