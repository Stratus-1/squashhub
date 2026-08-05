import { useEffect, useMemo, useRef } from "react";
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
  title?: string | null;
  message?: string | null;
  url?: string | null;
  club_member_id?: string | null;
  data?: Record<string, any> | null;
};

function getNotificationData(notification?: NotificationLike | null): Record<string, any> {
  const value = notification?.data;
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return value;
}

/**
 * True only for an actual club-event *invitation* that can be answered inline.
 * Reminders (type='reminder'), cancellations and RSVP-status updates sent to the
 * organiser also carry data.event_id, but must NOT be treated as invites —
 * otherwise they auto-dismiss before the member can read them.
 */
export function isEventInviteNotification(notification?: NotificationLike | null) {
  if (!notification) return false;
  const data = getNotificationData(notification);
  if (!data.event_id) return false;
  // Reminder / cancellation notifications are informational only.
  if ((notification.type || "") !== "booking") return false;
  // RSVP-change notifications to the organiser carry rsvp_status.
  if (data.rsvp_status) return false;
  const title = String(notification.title || "").toLowerCase();
  const message = String(notification.message || "").toLowerCase();
  if (title.includes("cancel") || message.includes("has been cancelled")) return false;
  return title.includes("invit") || message.includes("invited you");
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
  const eventId = String(getNotificationData(notification).event_id || "");
  const hasClosedAnsweredNotification = useRef(false);

  const memberIds = useMemo(() => {
    // A notification belongs to one member profile. Do not let an unanswered
    // linked profile keep an already-answered notification alive.
    if (notification.club_member_id) return [String(notification.club_member_id)];
    return Array.from(new Set(linkedMembers.map((m) => m?.id).filter(Boolean))) as string[];
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

      const { error: notificationError } = await fromExt("notifications")
        .update({ read: true })
        .eq("id", notification.id);
      if (notificationError) throw notificationError;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["event-invite-rsvps"] });
      qc.invalidateQueries({ queryKey: ["club-event-my-rsvps"] });
      qc.invalidateQueries({ queryKey: ["club-event-rsvps-data"] });
      qc.invalidateQueries({ queryKey: ["unread-notifications-modal"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      toast.success(vars.status === "confirmed" ? "You're confirmed — see you there!" : "RSVP declined");
      onResolved?.();
    },
    onError: (err: any) => toast.error(err?.message || "Could not update your RSVP"),
  });

  const targetRsvp = notification.club_member_id
    ? rsvps.find((r) => String(r.club_member_id) === String(notification.club_member_id))
    : rsvps[0];
  const targetStatus = String(targetRsvp?.status || "").toLowerCase();
  const targetAnswered = targetStatus === "confirmed" || targetStatus === "declined";

  // Repairs notifications that were previously reset to unread after the RSVP
  // had already been recorded, and prevents them from returning on app focus.
  useEffect(() => {
    if (!targetAnswered || hasClosedAnsweredNotification.current) return;
    hasClosedAnsweredNotification.current = true;
    void fromExt("notifications")
      .update({ read: true })
      .eq("id", notification.id)
      .then(({ error }) => {
        if (error) {
          hasClosedAnsweredNotification.current = false;
          return;
        }
        qc.invalidateQueries({ queryKey: ["unread-notifications-modal"] });
        qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
        onResolved?.();
      });
  }, [notification.id, onResolved, qc, targetAnswered]);

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
