import { useState, useMemo } from "react";
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
import { CalendarPlus, Loader2, Users, Trash2, Check, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

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

export function CreateClubEvent() {
  const { user } = useAuth();
  const { club } = useClubContext();
  const { activeMember, isAdmin } = useMemberContext();
  const queryClient = useQueryClient();
  const clubId = club?.id;

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    event_type: "social",
    day_of_week: "1",
    start_time: "18:00",
    end_time: "19:00",
    start_date: format(new Date(), "yyyy-MM-dd"),
    invite_scope: "all",
    invite_scope_id: "",
    is_club_booking: false,
    booked_by_member_id: "",
    court_ids: [] as number[],
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

  // Fetch club members for booker selection
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

  // Fetch existing club events
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["club-events", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_events")
        .select("*, club_event_courts(court_id)")
        .eq("club_id", clubId!)
        .eq("status", "active")
        .order("day_of_week");
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
  });

  // Get RSVP counts
  const eventIds = useMemo(() => (events || []).map((e: any) => e.id), [events]);
  const { data: rsvpCounts } = useQuery({
    queryKey: ["club-event-rsvps-counts", eventIds.join(",")],
    queryFn: async () => {
      if (eventIds.length === 0) return {};
      const { data, error } = await fromExt("club_event_rsvps")
        .select("event_id, status")
        .in("event_id", eventIds);
      if (error) throw error;
      const counts: Record<string, { invited: number; confirmed: number; declined: number }> = {};
      for (const r of data || []) {
        if (!counts[r.event_id]) counts[r.event_id] = { invited: 0, confirmed: 0, declined: 0 };
        counts[r.event_id][r.status as "invited" | "confirmed" | "declined"]++;
      }
      return counts;
    },
    enabled: eventIds.length > 0,
  });

  // My RSVPs
  const myMemberId = activeMember?.id;
  const { data: myRsvps } = useQuery({
    queryKey: ["club-event-my-rsvps", myMemberId, eventIds.join(",")],
    queryFn: async () => {
      if (!myMemberId || eventIds.length === 0) return {};
      const { data, error } = await fromExt("club_event_rsvps")
        .select("event_id, status, id")
        .eq("club_member_id", myMemberId)
        .in("event_id", eventIds);
      if (error) throw error;
      const map: Record<string, { id: string; status: string }> = {};
      for (const r of data || []) map[r.event_id] = { id: r.id, status: r.status };
      return map;
    },
    enabled: !!myMemberId && eventIds.length > 0,
  });

  // Determine members to invite based on scope
  const getInviteeIds = async (): Promise<string[]> => {
    if (!clubId) return [];
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

      // Create event
      const { data: event, error: eventError } = await fromExt("club_events").insert({
        club_id: clubId,
        created_by: user.id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        event_type: form.event_type,
        day_of_week: parseInt(form.day_of_week),
        start_time: form.start_time + ":00",
        end_time: form.end_time + ":00",
        start_date: form.start_date,
        invite_scope: form.invite_scope,
        invite_scope_id: form.invite_scope_id || null,
        is_club_booking: form.is_club_booking,
        booked_by_member_id: form.is_club_booking ? null : (form.booked_by_member_id || null),
      }).select("id").single();
      if (eventError) throw eventError;

      const eventId = event.id;

      // Insert courts
      const courtRows = form.court_ids.map((cid) => ({ event_id: eventId, court_id: cid }));
      const { error: courtError } = await fromExt("club_event_courts").insert(courtRows);
      if (courtError) throw courtError;

      // Invite members
      const inviteeIds = await getInviteeIds();
      if (inviteeIds.length > 0) {
        const rsvpRows = inviteeIds.map((mid) => ({
          event_id: eventId,
          club_member_id: mid,
          status: "invited",
        }));
        // Batch in chunks of 500
        for (let i = 0; i < rsvpRows.length; i += 500) {
          const chunk = rsvpRows.slice(i, i + 500);
          const { error: rsvpError } = await fromExt("club_event_rsvps").insert(chunk);
          if (rsvpError) throw rsvpError;
        }
      }

      // Create court bookings for the next occurrence
      const nextDate = getNextOccurrence(parseInt(form.day_of_week), form.start_date);
      for (const cid of form.court_ids) {
        const bookingUserId = form.is_club_booking
          ? user.id
          : (form.booked_by_member_id
            ? (members || []).find((m) => m.id === form.booked_by_member_id)?.user_id || user.id
            : user.id);

        await supabase.from("bookings").insert({
          court_id: cid,
          date: nextDate,
          start_time: form.start_time + ":00",
          end_time: form.end_time + ":00",
          user_id: bookingUserId,
          guest_name: form.is_club_booking ? `${club?.name || "Club"} — ${form.title}` : undefined,
          status: "active",
        });
      }

      // Send notifications to invited members
      if (inviteeIds.length > 0) {
        const memberUsers = await supabase.from("club_members").select("user_id").in("id", inviteeIds).not("user_id", "is", null);
        const userIds = (memberUsers.data || []).map((m) => m.user_id).filter(Boolean) as string[];
        const notifRows = userIds
          .filter((uid) => uid !== user.id)
          .map((uid) => ({
            user_id: uid,
            title: `${form.event_type.charAt(0).toUpperCase() + form.event_type.slice(1)} Event`,
            message: `You're invited to "${form.title}" every ${DAYS[parseInt(form.day_of_week)]} at ${form.start_time}`,
            type: "booking",
          }));
        if (notifRows.length > 0) {
          await supabase.from("notifications").insert(notifRows);
        }
      }

      return eventId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club-events"] });
      queryClient.invalidateQueries({ queryKey: ["club-event-rsvps-counts"] });
      toast.success("Event created and members invited!");
      setCreateOpen(false);
      resetForm();
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
      queryClient.invalidateQueries({ queryKey: ["club-event-rsvps-counts"] });
      toast.success("RSVP updated");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await fromExt("club_events").update({ status: "cancelled" }).eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club-events"] });
      toast.success("Event cancelled");
    },
  });

  const resetForm = () => {
    setForm({
      title: "",
      description: "",
      event_type: "social",
      day_of_week: "1",
      start_time: "18:00",
      end_time: "19:00",
      start_date: format(new Date(), "yyyy-MM-dd"),
      invite_scope: "all",
      invite_scope_id: "",
      is_club_booking: false,
      booked_by_member_id: "",
      court_ids: [],
    });
  };

  const toggleCourt = (courtId: number) => {
    setForm((f) => ({
      ...f,
      court_ids: f.court_ids.includes(courtId)
        ? f.court_ids.filter((id) => id !== courtId)
        : [...f.court_ids, courtId],
    }));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarPlus className="w-4 h-4 text-primary" />
          <p className="text-xs font-semibold font-heading">Club Events</p>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setCreateOpen(true)}>
          <CalendarPlus className="w-3 h-3" /> Create
        </Button>
      </div>

      {eventsLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        </div>
      ) : events && events.length > 0 ? (
        <div className="space-y-2">
          {events.map((e: any) => {
            const counts = rsvpCounts?.[e.id];
            const myRsvp = myRsvps?.[e.id];
            const courtNames = (e.club_event_courts || []).map((c: any) => `Court ${c.court_id}`).join(", ");
            const isCreator = e.created_by === user?.id;

            return (
              <Card key={e.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Every {DAYS[e.day_of_week]} · {String(e.start_time).slice(0, 5)}–{String(e.end_time).slice(0, 5)}
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

                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] text-muted-foreground">
                      {counts ? `${counts.confirmed} confirmed · ${counts.invited} pending` : "Loading..."}
                    </div>
                    <div className="flex items-center gap-1">
                      {myRsvp && myRsvp.status === "invited" && (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            className="h-6 text-[10px] px-2"
                            onClick={() => respondMutation.mutate({ rsvpId: myRsvp.id, status: "confirmed" })}
                          >
                            <Check className="w-3 h-3 mr-0.5" /> Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2"
                            onClick={() => respondMutation.mutate({ rsvpId: myRsvp.id, status: "declined" })}
                          >
                            <X className="w-3 h-3 mr-0.5" /> Decline
                          </Button>
                        </>
                      )}
                      {myRsvp && myRsvp.status !== "invited" && (
                        <Badge variant={myRsvp.status === "confirmed" ? "default" : "outline"} className="text-[9px] capitalize">
                          {myRsvp.status}
                        </Badge>
                      )}
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

      {/* Create Event Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Create Club Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Friday Social Night"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="min-h-[60px]"
                placeholder="Details about the event..."
              />
            </div>

            {/* Event Type */}
            <div className="space-y-1.5">
              <Label className="text-xs">Event Type</Label>
              <Select
                value={form.event_type}
                onValueChange={(v) => {
                  const isClubType = ["coaching", "training", "league"].includes(v);
                  setForm((f) => ({
                    ...f,
                    event_type: v,
                    // Auto-set club booking for admin-only types
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

            {/* Day & Time */}
            <div className="space-y-1.5">
              <Label className="text-xs">Recurring Day</Label>
              <Select value={form.day_of_week} onValueChange={(v) => setForm((f) => ({ ...f, day_of_week: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label className="text-xs">Start Date</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              />
            </div>

            {/* Courts */}
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

            {/* Invite Scope */}
            <div className="space-y-1.5">
              <Label className="text-xs">Invite</Label>
              <Select value={form.invite_scope} onValueChange={(v) => setForm((f) => ({ ...f, invite_scope: v, invite_scope_id: "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  <SelectItem value="category">By Fee Category</SelectItem>
                  <SelectItem value="league">By League</SelectItem>
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

            {/* Booking Name */}
            <div className="rounded-lg border border-border p-3 space-y-3">
              {isAdmin ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium">Book under Club name (free)</p>
                      <p className="text-[11px] text-muted-foreground">Court shows "{club?.name || "Club"} — {form.title || "Event"}"</p>
                    </div>
                    <Switch
                      checked={form.is_club_booking}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, is_club_booking: v, booked_by_member_id: "" }))}
                    />
                  </div>

                  {!form.is_club_booking && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Book under member</Label>
                      <Select value={form.booked_by_member_id} onValueChange={(v) => setForm((f) => ({ ...f, booked_by_member_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                        <SelectContent>
                          {(members || []).map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name || "Unnamed"}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium">Court booked under your name</p>
                  <p className="text-[11px] text-muted-foreground">You will be responsible for the booking fee</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getNextOccurrence(dayOfWeek: number, startDate: string): string {
  const start = new Date(startDate);
  const today = new Date();
  const ref = start > today ? start : today;
  const currentDay = ref.getDay();
  let daysUntil = dayOfWeek - currentDay;
  if (daysUntil <= 0) daysUntil += 7;
  const next = new Date(ref);
  next.setDate(ref.getDate() + daysUntil);
  return format(next, "yyyy-MM-dd");
}
