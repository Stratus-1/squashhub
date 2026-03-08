import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
const fromExt = (table: string) => (supabase as any).from(table);
const rpcExt: any = supabase.rpc.bind(supabase);
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";

type EventRow = {
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
};

type MyRsvpRow = {
  id: string;
  event_id: string;
  user_id: string;
  status: "going" | "maybe" | "not_going";
  guests: number;
  notes: string | null;
};

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [guests, setGuests] = useState("0");
  const [notes, setNotes] = useState("");

  const { data: event, isLoading, error } = useQuery({
    queryKey: ["event", id, user?.id ? "authed" : "anon"],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await fromExt("events").select("*").eq("id", id).single();
      if (error) throw error;
      return data as unknown as EventRow;
    },
    enabled: !!id,
  });

  const { data: counts } = useQuery({
    queryKey: ["event-rsvp-counts", id, user?.id ? "authed" : "anon"],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await rpcExt("get_event_rsvp_counts", { target_event_id: id });
      if (error) throw error;
      return data as any;
    },
    enabled: !!id && !!event,
  });

  const { data: myRsvp } = useQuery({
    queryKey: ["event-rsvp", id, user?.id],
    queryFn: async () => {
      if (!id || !user?.id) return null;
      const { data, error } = await fromExt("event_rsvps")
        .select("*")
        .eq("event_id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as unknown as MyRsvpRow | null;
    },
    enabled: !!id && !!user?.id && !!event,
  });

  const deadline = useMemo(() => (event?.rsvp_deadline ? new Date(event.rsvp_deadline) : null), [event?.rsvp_deadline]);
  const rsvpClosed = useMemo(() => (deadline ? deadline.getTime() < Date.now() : false), [deadline]);

  const upsertRsvp = useMutation({
    mutationFn: async (status: MyRsvpRow["status"]) => {
      if (!id) throw new Error("Missing event");
      if (!user?.id) throw new Error("Please log in to RSVP");

      const g = guests.trim() ? Number(guests) : 0;
      if (!Number.isFinite(g) || g < 0 || g > 20) throw new Error("Guests must be 0–20");

      const { error } = await fromExt("event_rsvps")
        .upsert(
          {
            event_id: id,
            user_id: user.id,
            status,
            guests: Math.trunc(g),
            notes: notes.trim() || null,
          } as any,
          { onConflict: "event_id,user_id" }
        );
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["event-rsvp", id, user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["event-rsvp-counts", id] });
      toast.success("RSVP saved");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to RSVP"),
  });

  const deleteRsvp = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing event");
      if (!user?.id) throw new Error("Please log in");
      const { error } = await supabase.from("event_rsvps").delete().eq("event_id", id).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["event-rsvp", id, user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["event-rsvp-counts", id] });
      toast.success("RSVP removed");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to remove RSVP"),
  });

  // hydrate inputs from existing RSVP
  useEffect(() => {
    if (!myRsvp) return;
    setGuests(String(myRsvp.guests ?? 0));
    setNotes(String(myRsvp.notes || ""));
  }, [myRsvp]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="bottom-nav-safe">
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

  const starts = new Date(event.starts_at);
  const ends = event.ends_at ? new Date(event.ends_at) : null;

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Event" subtitle={event.title} />

      <div className="px-4 sm:px-6 lg:px-[5%] mt-3 space-y-3 mb-20">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold font-heading">{event.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(starts, "EEE, d MMM yyyy · HH:mm")}
                {ends ? ` – ${format(ends, "HH:mm")}` : ""}
                {event.court_id ? ` · Court ${event.court_id}` : ""}
                {event.location ? ` · ${event.location}` : ""}
              </p>
            </div>
            {event.visibility === "public" ? <Badge variant="secondary">Public</Badge> : <Badge variant="secondary" className="bg-muted text-muted-foreground">Members</Badge>}
          </div>

          {event.description ? (
            <p className="text-sm text-muted-foreground mt-3 whitespace-pre-line">{event.description}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>{deadline ? `RSVP by ${format(deadline, "d MMM yyyy HH:mm")}` : "RSVP open"}</span>
            {event.capacity ? <span>· Capacity {event.capacity}</span> : null}
            {counts ? (
              <span>
                · {counts.going} going, {counts.maybe} maybe
                {counts.guests_total ? ` (+${counts.guests_total} guests)` : ""}
              </span>
            ) : null}
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-sm font-semibold font-heading">RSVP</p>
          {!user ? (
            <div className="mt-2 text-sm text-muted-foreground">
              <Link to="/auth" className="text-primary underline">
                Log in
              </Link>{" "}
              to RSVP.
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Guests</Label>
                  <Input
                    inputMode="numeric"
                    value={guests}
                    onChange={(e) => setGuests(e.target.value)}
                    disabled={rsvpClosed}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="min-h-[80px]"
                    disabled={rsvpClosed}
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  className="h-9 text-xs"
                  disabled={rsvpClosed || upsertRsvp.isPending}
                  onClick={() => upsertRsvp.mutate("going")}
                >
                  {upsertRsvp.isPending ? "Saving…" : "Going"}
                </Button>
                <Button
                  variant="secondary"
                  className="h-9 text-xs"
                  disabled={rsvpClosed || upsertRsvp.isPending}
                  onClick={() => upsertRsvp.mutate("maybe")}
                >
                  Maybe
                </Button>
                <Button
                  variant="outline"
                  className="h-9 text-xs"
                  disabled={rsvpClosed || upsertRsvp.isPending}
                  onClick={() => upsertRsvp.mutate("not_going")}
                >
                  Can't make it
                </Button>
                {myRsvp ? (
                  <Button
                    variant="ghost"
                    className="h-9 text-xs text-muted-foreground"
                    disabled={deleteRsvp.isPending}
                    onClick={() => deleteRsvp.mutate()}
                  >
                    Remove RSVP
                  </Button>
                ) : null}
              </div>

              {rsvpClosed ? (
                <p className="text-[11px] text-muted-foreground">
                  RSVPs are closed for this event.
                </p>
              ) : null}

              {myRsvp ? (
                <p className="text-[11px] text-muted-foreground">
                  Your RSVP: <span className="font-medium">{myRsvp.status.replace("_", " ")}</span>
                </p>
              ) : null}
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
