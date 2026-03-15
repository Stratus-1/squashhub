import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Bell, Calendar, CheckCircle, Swords, Trophy, ChevronRight, Check, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  url?: string | null;
  read: boolean;
  created_at: string;
};

const iconMap: Record<string, typeof Bell> = {
  challenge: Swords,
  booking: Calendar,
  ladder: Trophy,
  match: CheckCircle,
  marketing: Bell,
  event: Calendar,
  general: Bell,
};

const typeLabel: Record<string, string> = {
  challenge: "Challenge",
  booking: "Booking",
  ladder: "Ladder",
  match: "Match",
  marketing: "Club News",
  event: "Event",
  general: "Notification",
};

/** Tracks when the app was last active to detect "returning" users */
const LAST_ACTIVE_KEY = "gb_last_active_ts";
const RETURN_THRESHOLD_MS = 30_000; // 30 seconds away = "returning"

function getActionLabel(type: string): string {
  switch (type) {
    case "challenge": return "View Challenge";
    case "booking": return "View Booking";
    case "match": return "View Match";
    case "event": return "View Event";
    case "ladder": return "View Ladder";
    default: return "View";
  }
}

export function NotificationActionModal() {
  const { user } = useAuth();
  const { activeMember } = useMemberContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Fetch unread notifications
  const { data: unreadNotifications } = useQuery({
    queryKey: ["unread-notifications-modal", user?.id, activeMember?.id],
    queryFn: async () => {
      let query = supabase
        .from("notifications")
        .select("*")
        .eq("read", false)
        .order("created_at", { ascending: false })
        .limit(20);

      if (activeMember?.id) {
        query = query.eq("club_member_id", activeMember.id);
      } else {
        query = query.eq("user_id", user!.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as NotificationRow[];
    },
    enabled: !!user?.id,
    refetchOnWindowFocus: true,
  });

  // Detect when user returns to the app
  useEffect(() => {
    if (!user?.id) return;

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
      }
      if (document.visibilityState === "visible") {
        const lastActive = Number(localStorage.getItem(LAST_ACTIVE_KEY) || "0");
        const away = Date.now() - lastActive;
        if (lastActive > 0 && away >= RETURN_THRESHOLD_MS) {
          // User is returning — refetch and show modal
          setDismissed(false);
          setCurrentIndex(0);
          queryClient.invalidateQueries({ queryKey: ["unread-notifications-modal", user.id] });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [user?.id, queryClient]);

  // Also show on first mount if there are unread notifications
  useEffect(() => {
    if (!dismissed && unreadNotifications && unreadNotifications.length > 0) {
      setOpen(true);
    }
  }, [unreadNotifications, dismissed]);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["unread-notifications-modal", user?.id] });
    },
  });

  const notifications = unreadNotifications || [];
  const current = notifications[currentIndex] || null;
  const total = notifications.length;
  const isLast = currentIndex >= total - 1;

  const handleAction = useCallback(() => {
    if (!current) return;
    markRead.mutate(current.id);
    const url = current.url || "/notifications";
    const shouldOpenDetail = current.type === "marketing" || url.startsWith("/notifications");
    setOpen(false);
    setDismissed(true);
    navigate(shouldOpenDetail ? `/notifications?notificationId=${current.id}` : url);
  }, [current, markRead, navigate]);

  const handleDismiss = useCallback(() => {
    if (!current) return;
    markRead.mutate(current.id);
    if (isLast) {
      setOpen(false);
      setDismissed(true);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [current, isLast, markRead]);

  const handleDismissAll = useCallback(() => {
    // Mark all as read
    for (const n of notifications) {
      if (!n.read) markRead.mutate(n.id);
    }
    setOpen(false);
    setDismissed(true);
  }, [notifications, markRead]);

  if (!user || total === 0) return null;

  const Icon = current ? (iconMap[current.type] || Bell) : Bell;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setDismissed(true);
        }
        setOpen(v);
      }}
    >
      <DialogContent className="max-w-sm p-0 overflow-hidden gap-0">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Bell className="w-4 h-4 text-primary shrink-0" />
            <p className="text-sm font-semibold font-heading truncate">
              {total === 1 ? "New Notification" : `${total} New Notifications`}
            </p>
          </div>
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {currentIndex + 1} / {total}
          </Badge>
        </div>

        {/* Notification content */}
        {current && (
          <div className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                "bg-primary/10 text-primary"
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] px-1.5">
                    {typeLabel[current.type] || "Notification"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(current.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm font-semibold mt-1.5">{current.title}</p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {current.message}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 pt-1">
              {current.url && !current.url.startsWith("/notifications") && (
                <Button className="w-full" onClick={handleAction}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {getActionLabel(current.type)}
                </Button>
              )}
              {current.type === "marketing" && (
                <Button className="w-full" onClick={handleAction}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Read More
                </Button>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleDismiss}
                >
                  <Check className="w-4 h-4 mr-1.5" />
                  {isLast ? "Done" : "Next"}
                  {!isLast && <ChevronRight className="w-3.5 h-3.5 ml-1" />}
                </Button>

                {total > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={handleDismissAll}
                  >
                    Dismiss all
                  </Button>
                )}
              </div>
            </div>

            {/* Progress dots */}
            {total > 1 && (
              <div className="flex items-center justify-center gap-1.5 pt-1">
                {notifications.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-1.5 h-1.5 rounded-full transition-all",
                      i === currentIndex ? "bg-primary w-3" : i < currentIndex ? "bg-primary/40" : "bg-muted-foreground/20"
                    )}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
