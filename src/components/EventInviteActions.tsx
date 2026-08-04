import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2 } from "lucide-react";
import { fromExt } from "@/lib/supabase-ext";
import { useMemberContext } from "@/contexts/MemberContext";

type NotificationLike = {
  id: string;
  type?: string | null;
  url?: string | null;
  club_member_id?: string | null;
  data?: Record<string, any> | null;
};

/** True when the notification is a club-event invite that can be answered inline. */
export function isEventInviteNotification(notification?: NotificationLike | null) {
  if (!notification) return false;
  const eventId = notification.data?.event_id;
  return !!eventId;
}

/**
 * Inline Confirm / Decline buttons for a club event invitation, shown in the
 * notification detail view so members don't have to hunt for the Events page.
 */
export function EventInviteActions({
  notification,
  onResolved,
}: {
  notification: NotificationLike;
  onResolved?: () => void;
}) {
  const qc = useQueryClient();
  const { linkedMembers } = useMemberContext();
  const eventId = String(notification.data?.event_id || "");

  const memberIds = useMemo(() => {
    const ids = new Set<string>();
    if (notification.club_member_id) ids.add(String(notification.club_member_id));
    for (const m of linkedMembers) if (m?.id) ids.add(m.id);
    return Array.from(ids);
  }, [notification.club_member_id, linkedMembers]);

  const { data: event } = useQuery({
    queryKey: ["event-invite-event", eventId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_events")
        .select("id, title, start_date, start_time, end_time, status")
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!eventId,
  });

  const { data: rsvps = [], isLoading } = useQuery({
    queryKey: ["event-invite-rsvps", eventId, memberIds.join(",")],
    queryFn: async () => {
      const { data, error } = await fromExt("club_event_rsvps")
        .select("id, status, club_member_id")
        .eq("event_id", eventId)
        .in("club_member_id", memberIds);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!eventId && memberIds.length > 0,
  });

  const respond = useMutation({
    mutationFn: async ({ rsvpId, status }: { rsvpId: string; status: string }) => {
      const { error } = await fromExt("club_event_rsvps")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", rsvpId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["event-invite-rsvps"] });
      qc.invalidateQueries({ queryKey: ["club-event-my-rsvps"] });
      qc.invalidateQueries({ queryKey: ["club-event-rsvps-data"] });
      toast.success(vars.status === "confirmed" ? "You're confirmed — see you there!" : "RSVP declined");
      onResolved?.();
    },
    onError: (err: any) => toast.error(err?.message || "Could not update your RSVP"),
  });

  if (!eventId) return null;

  const cancelled = String(event?.status || "").toLowerCase() === "cancelled";
  const when =
    event?.start_date
      ? `${format(new Date(`${event.start_date}T00:00:00`), "EEE d MMM")} · ${String(event.start_time || "").slice(0, 5)}`
      : "";

  return (
    <Card className="p-3 space-y-3">
      <div>
        <p className="text-sm font-semibold">{event?.title || "Club event"}</p>
        {when ? <p className="text-[11px] text-muted-foreground mt-0.5">{when}</p> : null}
      </div>

      {cancelled ? (
        <p className="text-xs text-muted-foreground">This event has been cancelled.</p>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your invitation…
        </div>
      ) : rsvps.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No invitation found for your profile. Open Events to see the full details.
        </p>
      ) : (
        <div className="space-y-2">
          {rsvps.map((r) => {
            const member = linkedMembers.find((m) => m.id === r.club_member_id);
            const status = String(r.status || "").toLowerCase();
            const answered = status === "confirmed" || status === "declined";
            return (
              <div key={r.id} className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-medium">
                  {member?.name || "You"}
                  {answered ? (
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
  );
}
