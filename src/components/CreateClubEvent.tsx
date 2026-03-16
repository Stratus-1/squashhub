import { useState, useMemo, useEffect } from "react";
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
import { CalendarPlus, Loader2, Users, Trash2, Check, X, ChevronRight, ChevronLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, addDays, addWeeks, addMonths, addYears } from "date-fns";

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
  for (let h = 6; h < 22; h++) {
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
  { value: "24", label: "24 hours before" },
  { value: "48", label: "48 hours before" },
  { value: "72", label: "72 hours before" },
];

export function CreateClubEvent({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  const { club } = useClubContext();
  const { activeMember, isAdmin } = useMemberContext();
  const queryClient = useQueryClient();
  const clubId = club?.id;

  const [createOpen, setCreateOpen] = useState(!!onClose); // auto-open when embedded from Events page
  const [step, setStep] = useState(1); // 1: Date/Time/Recurrence, 2: Details, 3: Invites & Fees
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
      const { data, error } = await supabase.from("courts").select("id, name").eq("club_id", clubId!).order("id");
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
      const { data, error } = await supabase.from("leagues").select("id, name").eq("club_id", clubId!).order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    enabled: !!clubId && form.invite_scope === "league",
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

  // Get RSVP counts + confirmed member names
  const eventIds = useMemo(() => (events || []).map((e: any) => e.id), [events]);
  const { data: rsvpData } = useQuery({
    queryKey: ["club-event-rsvps-data", eventIds.join(",")],
    queryFn: async () => {
      if (eventIds.length === 0) return { counts: {}, confirmedNames: {} };
      const { data, error } = await fromExt("club_event_rsvps")
        .select("event_id, status, club_member_id")
        .in("event_id", eventIds);
      if (error) throw error;
      const counts: Record<string, { invited: number; confirmed: number; declined: number }> = {};
      const confirmedMemberIds: Record<string, string[]> = {};
      for (const r of data || []) {
        if (!counts[r.event_id]) counts[r.event_id] = { invited: 0, confirmed: 0, declined: 0 };
        counts[r.event_id][r.status as "invited" | "confirmed" | "declined"]++;
        if (r.status === "confirmed") {
          if (!confirmedMemberIds[r.event_id]) confirmedMemberIds[r.event_id] = [];
          confirmedMemberIds[r.event_id].push(r.club_member_id);
        }
      }
      // Resolve member names for confirmed attendees
      const allMemberIds = [...new Set(Object.values(confirmedMemberIds).flat())];
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
      return { counts, confirmedNames };
    },
    enabled: eventIds.length > 0,
  });
  const rsvpCounts = rsvpData?.counts;
  const confirmedNames = rsvpData?.confirmedNames;

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

  // Pre-select the creator as an attendee
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

  // Determine members to invite based on scope
  const getInviteeIds = async (): Promise<string[]> => {
    if (!clubId) return [];
    if (form.invite_scope === "selected") {
      return form.selected_member_ids;
    }
    if (form.invite_scope === "all") {
      const { data } = await supabase.from("club_members").select("id").eq("club_id", clubId);
      return (data || []).map((m) => m.id);
    }
    if (form.invite_scope === "category" && form.invite_scope_id) {
      const { data } = await supabase.from("club_members").select("id").eq("club_id", clubId).eq("fee_category_id", form.invite_scope_id);
      return (data || []).map((m) => m.id);
    }
    if (form.invite_scope === "league" && form.invite_scope_id) {
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
        is_club_booking: form.is_club_booking,
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

      // Invite members - create RSVPs for both event-level and first instance
      const inviteeIds = await getInviteeIds();

      // Event-level RSVPs (backwards compat)
      if (inviteeIds.length > 0) {
        const rsvpRows = inviteeIds.map((mid) => ({
          event_id: eventId,
          club_member_id: mid,
          status: "invited",
        }));
        for (let i = 0; i < rsvpRows.length; i += 500) {
          const chunk = rsvpRows.slice(i, i + 500);
          await fromExt("club_event_rsvps").insert(chunk);
        }
      }

      // Instance-level RSVPs for each instance
      if (inviteeIds.length > 0 && instances && instances.length > 0) {
        for (const inst of instances) {
          const instRsvpRows = inviteeIds.map((mid: string) => ({
            instance_id: inst.id,
            club_member_id: mid,
            status: "invited",
          }));
          for (let i = 0; i < instRsvpRows.length; i += 500) {
            const chunk = instRsvpRows.slice(i, i + 500);
            await fromExt("club_event_instance_rsvps").insert(chunk);
          }
        }
      }

      // Create court bookings — split across booking members (max 1hr each)
      const firstDate = instanceDates[0];
      const startMinutes = parseInt(form.start_time.split(":")[0]) * 60 + parseInt(form.start_time.split(":")[1]);
      const endMinutes = parseInt(form.end_time.split(":")[0]) * 60 + parseInt(form.end_time.split(":")[1]);
      const totalMinutes = endMinutes - startMinutes;

      if (form.is_club_booking) {
        // Admin club booking: single booking per court under club name
        for (const cid of form.court_ids) {
          await supabase.from("bookings").insert({
            court_id: cid,
            date: firstDate,
            start_time: form.start_time + ":00",
            end_time: form.end_time + ":00",
            user_id: user.id,
            guest_name: `${club?.name || "Club"} — ${form.title}`,
            status: "active",
          });
        }
      } else {
        // Member bookings: distribute across courts × hour-sessions
        // e.g. 3 courts × 2hr = 6 bookings, each assigned to a different member
        const hourSessionsPerCourt = Math.ceil(totalMinutes / 60);
        const totalSessionsNeeded = hourSessionsPerCourt * form.court_ids.length;
        const bookingMembers = form.booking_member_ids
          .slice(0, totalSessionsNeeded)
          .map((mid) => (members || []).find((m) => m.id === mid))
          .filter(Boolean) as { id: string; name: string | null; user_id: string | null }[];

        if (bookingMembers.length > 0) {
          const slotMinutes = Math.min(60, Math.ceil(totalMinutes / hourSessionsPerCourt));
          let memberIdx = 0;

          for (const cid of form.court_ids) {
            let offsetMin = 0;
            while (offsetMin < totalMinutes && memberIdx < bookingMembers.length) {
              const bm = bookingMembers[memberIdx];
              const slotEnd = Math.min(offsetMin + slotMinutes, totalMinutes);
              const slotStartTime = `${String(Math.floor((startMinutes + offsetMin) / 60)).padStart(2, "0")}:${String((startMinutes + offsetMin) % 60).padStart(2, "0")}:00`;
              const slotEndTime = `${String(Math.floor((startMinutes + slotEnd) / 60)).padStart(2, "0")}:${String((startMinutes + slotEnd) % 60).padStart(2, "0")}:00`;

              await supabase.from("bookings").insert({
                court_id: cid,
                date: firstDate,
                start_time: slotStartTime,
                end_time: slotEndTime,
                user_id: bm.user_id || user.id,
                club_member_id: bm.id,
                guest_name: `${form.title}${bm.name ? ` (${bm.name})` : ""}`,
                status: "active",
                club_id: clubId || null,
              } as any);
              offsetMin = slotEnd;
              memberIdx++;
            }
          }
        }
      }

      // Send notifications (best-effort, don't block event creation)
      if (inviteeIds.length > 0) {
        try {
          const memberUsers = await supabase.from("club_members").select("user_id").in("id", inviteeIds).not("user_id", "is", null);
          const userIds = (memberUsers.data || []).map((m) => m.user_id).filter(Boolean) as string[];
          const recurrenceText = form.recurrence === "once"
            ? `on ${format(new Date(form.event_date), "EEE d MMM")}`
            : `${form.recurrence} from ${format(new Date(form.event_date), "EEE d MMM")}`;
          const notifRows = userIds
            .map((uid) => ({
              user_id: uid,
              title: `${form.event_type.charAt(0).toUpperCase() + form.event_type.slice(1)} Event`,
              message: `You're invited to "${form.title}" ${recurrenceText} at ${form.start_time}`,
              type: "booking",
            }));
          if (notifRows.length > 0) {
            await fromExt("notifications").insert(notifRows);
          }
        } catch (notifErr) {
          console.warn("[CreateClubEvent] Notification insert failed (non-blocking):", notifErr);
        }
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
    mutationFn: async (eventId: string) => {
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
      if (evt && eventCourts?.length && instances?.length) {
        const courtIds = eventCourts.map((c: any) => c.court_id);
        const dates = instances.map((i: any) => i.instance_date);

        for (const date of dates) {
          await supabase
            .from("bookings")
            .update({ status: "cancelled" })
            .in("court_id", courtIds)
            .eq("date", date)
            .gte("start_time", evt.start_time)
            .lte("end_time", evt.end_time);
        }
      }

      // Cancel the event
      const { error } = await fromExt("club_events").update({ status: "cancelled" }).eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club-events"] });
      queryClient.invalidateQueries({ queryKey: ["club-events-list"] });
      toast.success("Event cancelled");
    },
  });

  const resetForm = () => {
    const selfId = activeMember?.id;
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
  const canGoStep3 = form.title.trim() && form.court_ids.length > 0;

  return (
    <div className="space-y-3">
      {!onClose && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarPlus className="w-4 h-4 text-primary" />
            <p className="text-xs font-semibold font-heading">Club Events</p>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { resetForm(); setCreateOpen(true); }}>
            <CalendarPlus className="w-3 h-3" /> Create
          </Button>
        </div>
      )}

      {eventsLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        </div>
      ) : events && events.length > 0 ? (
        <div className="space-y-2">
          {events.map((e: any) => {
            const counts = rsvpCounts?.[e.id];
            const myRsvpList = myRsvps?.[e.id] || [];
            const courtNames = (e.club_event_courts || []).map((c: any) => `Court ${c.court_id}`).join(", ");
            const isCreator = e.created_by === user?.id;
            const recLabel = e.recurrence && e.recurrence !== "once" ? e.recurrence : null;

            return (
              <Card key={e.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {recLabel
                          ? `${recLabel.charAt(0).toUpperCase() + recLabel.slice(1)} · ${DAYS[e.day_of_week]}`
                          : DAYS[e.day_of_week]
                        } · {String(e.start_time).slice(0, 5)}–{String(e.end_time).slice(0, 5)}
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

                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] text-muted-foreground">
                      {counts ? `${counts.confirmed} confirmed · ${counts.invited} pending` : "Loading..."}
                      {e.light_fee_split === "attendees" && (
                        <span className="ml-1">· Lights shared</span>
                      )}
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
                      {isCreator && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => cancelMutation.mutate(e.id)}
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
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
          <p className="text-xs text-muted-foreground">No active club events. Create one to get started!</p>
        </Card>
      )}

      {/* Create Event Dialog - Multi-step */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              Create Event
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
                <Input
                  type="date"
                  value={form.event_date}
                  onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
                />
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
                  onValueChange={(v) => {
                    const isClubType = ["coaching", "training", "league"].includes(v);
                    setForm((f) => ({
                      ...f,
                      event_type: v,
                      is_club_booking: isClubType ? true : f.is_club_booking,
                    }));
                  }}
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
                  </SelectContent>
                </Select>
              </div>

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

              {form.invite_scope === "selected" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Select Members ({form.selected_member_ids.length} selected)</Label>
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

              {/* Court Booking Assignment */}
              <div className="rounded-lg border border-border p-3 space-y-3">
                <Label className="text-xs font-medium">Court Booking Names</Label>
                <p className="text-[11px] text-muted-foreground">
                  Club rules limit 1 hour per member. Select members to split the booking across.
                </p>

                {isAdmin && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium">Book under Club name (free)</p>
                      <p className="text-[11px] text-muted-foreground">Court shows "{club?.name || "Club"} — {form.title || "Event"}"</p>
                    </div>
                    <Switch
                      checked={form.is_club_booking}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, is_club_booking: v, booking_member_ids: [] }))}
                    />
                  </div>
                )}

                {!form.is_club_booking && (() => {
                  const invitedMembers = form.invite_scope === "selected"
                    ? (members || []).filter((m) => form.selected_member_ids.includes(m.id))
                    : (members || []);

                  const startMin = parseInt(form.start_time.split(":")[0]) * 60 + parseInt(form.start_time.split(":")[1]);
                  const endMin = parseInt(form.end_time.split(":")[0]) * 60 + parseInt(form.end_time.split(":")[1]);
                  const totalMin = endMin - startMin;
                  const hourSessionsPerCourt = Math.ceil(totalMin / 60);
                  const numCourts = form.court_ids.length || 1;
                  const sessionsNeeded = hourSessionsPerCourt * numCourts;

                  return (
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        {numCourts} court{numCourts !== 1 ? "s" : ""} × {hourSessionsPerCourt} hr session{hourSessionsPerCourt !== 1 ? "s" : ""} = {sessionsNeeded} booking{sessionsNeeded !== 1 ? "s" : ""} needed (max 1hr per member).
                        First {sessionsNeeded} selected member{sessionsNeeded !== 1 ? "s" : ""} will have bookings in their name.
                      </p>
                      <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2 space-y-1">
                        {invitedMembers.map((m) => {
                          const isSelected = form.booking_member_ids.includes(m.id);
                          const selIndex = form.booking_member_ids.indexOf(m.id);
                          const isBookingName = isSelected && selIndex < sessionsNeeded;
                          return (
                            <label
                              key={m.id}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent/50 transition-colors text-sm",
                                isSelected && "bg-accent",
                              )}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => {
                                  setForm((f) => ({
                                    ...f,
                                    booking_member_ids: isSelected
                                      ? f.booking_member_ids.filter((id) => id !== m.id)
                                      : [...f.booking_member_ids, m.id],
                                  }));
                                }}
                              />
                              <span className="text-xs">{m.name || "Unnamed"}</span>
                              {isBookingName && (
                                <Badge variant="secondary" className="text-[9px] ml-auto">Booking {selIndex + 1}</Badge>
                              )}
                            </label>
                          );
                        })}
                      </div>
                      {form.booking_member_ids.length > 0 && (
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          <p className="font-medium text-foreground">Booking split preview:</p>
                          {(() => {
                            const bookingIds = form.booking_member_ids.slice(0, sessionsNeeded);
                            const slotMin = Math.min(60, Math.ceil(totalMin / hourSessionsPerCourt));
                            let memberIdx = 0;
                            const courtList = form.court_ids.length > 0 ? form.court_ids : [0];
                            const courtNames = (courts || []).reduce((acc, c) => ({ ...acc, [c.id]: c.name }), {} as Record<number, string>);
                            return courtList.map((cid) => {
                              let offset = 0;
                              const slots: JSX.Element[] = [];
                              while (offset < totalMin && memberIdx < bookingIds.length) {
                                const mid = bookingIds[memberIdx];
                                const m = invitedMembers.find((x) => x.id === mid);
                                const slotEnd = Math.min(offset + slotMin, totalMin);
                                const sTime = `${String(Math.floor((startMin + offset) / 60)).padStart(2, "0")}:${String((startMin + offset) % 60).padStart(2, "0")}`;
                                const eTime = `${String(Math.floor((startMin + slotEnd) / 60)).padStart(2, "0")}:${String((startMin + slotEnd) % 60).padStart(2, "0")}`;
                                slots.push(
                                  <p key={`${cid}-${mid}`} className="pl-2">{m?.name || "Unnamed"}: {sTime}–{eTime}</p>
                                );
                                offset = slotEnd;
                                memberIdx++;
                              }
                              return (
                                <div key={cid}>
                                  <p className="font-medium text-foreground">{courtNames[cid] || `Court ${cid}`}</p>
                                  {slots}
                                </div>
                              );
                            });
                          })()}
                          {form.booking_member_ids.length > sessionsNeeded && (
                            <p className="text-muted-foreground italic">
                              +{form.booking_member_ids.length - sessionsNeeded} more invited (no booking in their name)
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
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
                  Booked under: {form.is_club_booking ? `${club?.name || "Club"}` : `${form.booking_member_ids.length} member(s)`}
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
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Event"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
