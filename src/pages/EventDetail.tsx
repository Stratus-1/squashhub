import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { absoluteUrl } from "@/lib/site";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Check, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useMemo } from "react";

type ClubEventRow = {
  id: string;
  club_id: string;
  title: string;
  description: string | null;
  start_date: string;
  start_time: string;
  end_time: string;
  recurrence: string;
  event_type: string;
  status: string;
};

type RsvpRow = {
  id: string;
  event_id: string;
  club_member_id: string;
  status: string;
};

function localDate(date: string, time: string | null) {
  if (!date) return null;
  const d = new Date(`${date}T${(time || "00:00").slice(0, 5)}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { linkedMembers } = useMemberContext();

  const memberIds = useMemo(
    () => Array.from(new Set((linkedMembers || []).map((m: any) => m?.id).filter(Boolean))) as string[],
    [linkedMembers]
  );

  const { data: event, isLoading, error } = useQuery({
    queryKey: ["club-event", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("club_events")
        .select("id,club_id,title,description,start_date,start_time,end_time,recurrence,event_type,status")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as unknown as ClubEventRow | null;
    },
    enabled: !!id,
  });

  // Next upcoming occurrence for recurring events.
  const { data: nextInstance } = useQuery({
    queryKey: ["club-event-next-instance", id],
    queryFn: async () => {
      if (!id) return null;
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("club_event_instances")
        .select("id,instance_date,status")
        .eq("event_id", id)
        .gte("instance_date", today)
        .order("instance_date", { ascending: true })
        .limit(1);
      if (error) throw error;
      return (data || [])[0] || null;
    },
    enabled: !!id && !!event,
  });

  const { data: rsvps = [] } = useQuery({
    queryKey: ["club-event-rsvps-data", id, memberIds.join(",")],
    queryFn: async () => {
      if (!id || memberIds.length === 0) return [] as RsvpRow[];
      const { data, error } = await supabase
        .from("club_event_rsvps")
        .select("id,event_id,club_member_id,status")
        .eq("event_id", id)
        .in("club_member_id", memberIds);
      if (error) throw error;
      return (data || []) as unknown as RsvpRow[];
    },
    enabled: !!id && !!event && memberIds.length > 0,
  });

  const { data: counts } = useQuery({
    queryKey: ["club-event-rsvp-counts", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("club_event_rsvps")
        .select("status")
        .eq("event_id", id);
      if (error) throw error;
      const rows = (data || []) as { status: string }[];
      return {
        confirmed: rows.filter((r) => String(r.status).toLowerCase() === "confirmed").length,
        invited: rows.filter((r) => String(r.status).toLowerCase() === "invited").length,
        declined: rows.filter((r) => String(r.status).toLowerCase() === "declined").length,
      };
    },
    enabled: !!id && !!event,
  });

  const respond = useMutation({
    mutationFn: async ({ rsvpId, status }: { rsvpId: string; status: string }) => {
      const { error } = await supabase
        .from("club_event_rsvps")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", rsvpId);
      if (error) throw error;
    },
    onSuccess: async (_d, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["club-event-rsvps-data"] });
      await queryClient.invalidateQueries({ queryKey: ["club-event-rsvp-counts", id] });
      await queryClient.invalidateQueries({ queryKey: ["club-event-my-rsvps"] });
      toast.success(vars.status === "confirmed" ? "You're confirmed — see you there!" : "RSVP declined");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update your RSVP"),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <SEO title="Event" path={id ? `/events/${id}` : "/events"} noIndex />
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="bottom-nav-safe">
        <SEO title="Event" path={id ? `/events/${id}` : "/events"} noIndex />
        <PageHeader title="Event" />
        <div className="px-4 mt-3 space-y-3">
          <Card className="p-4 text-sm text-muted-foreground">
            {String((error as any)?.message || "Event not found or not accessible.")}
          </Card>
          <Button variant="outline" onClick={() => navigate("/events")}>
            Back to events
          </Button>
        </div>
      </div>
    );
  }

  const displayDate = (nextInstance as any)?.instance_date || event.start_date;
  const starts = localDate(displayDate, event.start_time);
  const ends = localDate(displayDate, event.end_time);
  const cancelled = String(event.status).toLowerCase() === "cancelled";
  const eventUrlPath = `/events/${event.id}`;
  const seoDescription = (event.description || "").replace(/\s+/g, " ").trim().slice(0, 160) || "Upcoming club event.";

  return (
    <div className="bottom-nav-safe">
      <SEO title={event.title} description={seoDescription} path={eventUrlPath} type="article" noIndex />
      <PageHeader title="Event" subtitle={event.title} />

      <div className="px-4 sm:px-6 lg:px-[5%] mt-3 space-y-3 mb-20">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold font-heading">{event.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {starts ? format(starts, "EEE, d MMM yyyy · HH:mm") : "Date to be confirmed"}
                {ends ? ` – ${format(ends, "HH:mm")}` : ""}
              </p>
            </div>
            {cancelled ? (
              <Badge variant="secondary" className="bg-destructive/10 text-destructive">Cancelled</Badge>
            ) : (
              <Badge variant="secondary">{event.recurrence === "once" ? "One-off" : "Recurring"}</Badge>
            )}
          </div>

          {event.description ? (
            <p className="text-sm text-muted-foreground mt-3 whitespace-pre-line">{event.description}</p>
          ) : null}

          {counts ? (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {counts.confirmed} confirmed · {counts.invited} awaiting reply · {counts.declined} declined
            </p>
          ) : null}
        </Card>

        <Card className="p-4">
          <p className="text-sm font-semibold font-heading">Your reply</p>

          {!user ? (
            <div className="mt-2 text-sm text-muted-foreground">
              <Link to="/auth" className="text-primary underline">Log in</Link> to reply.
            </div>
          ) : cancelled ? (
            <p className="mt-2 text-xs text-muted-foreground">This event has been cancelled.</p>
          ) : rsvps.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              You haven't been invited to this event.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {rsvps.map((r) => {
                const member = (linkedMembers || []).find((m: any) => m.id === r.club_member_id) as any;
                const status = String(r.status || "").toLowerCase();
                return (
                  <div key={r.id} className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-medium">
                      {member?.name || "You"}
                      {status === "confirmed" || status === "declined" ? (
                        <span className="ml-1.5 text-muted-foreground font-normal">
                          · {status === "confirmed" ? "Confirmed" : "Declined"}
                        </span>
                      ) : null}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={status === "confirmed" ? "default" : "outline"}
                        disabled={respond.isPending}
                        onClick={() => respond.mutate({ rsvpId: r.id, status: "confirmed" })}
                      >
                        <Check className="w-3.5 h-3.5 mr-1" /> Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant={status === "declined" ? "destructive" : "outline"}
                        disabled={respond.isPending}
                        onClick={() => respond.mutate({ rsvpId: r.id, status: "declined" })}
                      >
                        <X className="w-3.5 h-3.5 mr-1" /> Decline
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Button variant="outline" onClick={() => navigate("/events")}>
          Back to events
        </Button>
      </div>
    </div>
  );
}
