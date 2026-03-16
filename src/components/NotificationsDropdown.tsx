import { useMemo, useState } from "react";
import type { ComponentProps } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useUnreadNotificationsCount } from "@/hooks/use-data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Bell, Calendar, CheckCircle, Loader2, Swords, Trophy } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

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

export function NotificationsDropdown({
  triggerClassName,
  triggerVariant = "ghost",
}: {
  triggerClassName?: string;
  triggerVariant?: ComponentProps<typeof Button>["variant"];
}) {
  const { user } = useAuth();
  const { activeMember, linkedMembers } = useMemberContext();
  const { data: unreadCount } = useUnreadNotificationsCount();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const canLoad = !!user?.id;
  const linkedMemberIds = useMemo(
    () => Array.from(new Set(linkedMembers.map((member) => member.id).filter(Boolean))),
    [linkedMembers]
  );

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["notifications", user?.id, activeMember?.id, linkedMemberIds.join(",")],
    queryFn: async () => {
      if (!user?.id) return [] as NotificationRow[];

      const [memberResult, legacyResult] = await Promise.all([
        linkedMemberIds.length > 0
          ? supabase
              .from("notifications")
              .select("*")
              .in("club_member_id", linkedMemberIds)
              .order("created_at", { ascending: false })
              .limit(15)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .is("club_member_id", null)
          .order("created_at", { ascending: false })
          .limit(15),
      ]);

      if (memberResult.error) throw memberResult.error;
      if (legacyResult.error) throw legacyResult.error;

      return [...(memberResult.data || []), ...(legacyResult.data || [])]
        .filter((notification, index, all) => all.findIndex((item) => item.id === notification.id) === index)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 15) as NotificationRow[];
    },
    enabled: canLoad && open,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;

      const updates = [
        supabase
          .from("notifications")
          .update({ read: true })
          .eq("user_id", user.id)
          .is("club_member_id", null)
          .eq("read", false),
      ];

      if (linkedMemberIds.length > 0) {
        updates.push(
          supabase
            .from("notifications")
            .update({ read: true })
            .in("club_member_id", linkedMemberIds)
            .eq("read", false)
        );
      }

      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  const hasUnread = useMemo(() => (unreadCount ?? 0) > 0, [unreadCount]);

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={triggerVariant}
          size="icon"
          className={cn("relative", triggerClassName)}
          aria-label="Open notifications"
        >
          <Bell className="w-5 h-5" />
          {hasUnread && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent" />}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[92vw] max-w-sm p-0 overflow-hidden"
      >
        <div className="p-3 border-b flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-[11px] text-muted-foreground">
              {hasUnread ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!hasUnread || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            {markAllRead.isPending ? "Marking..." : "Mark all read"}
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : notifications && notifications.length > 0 ? (
            <div className="divide-y divide-border">
              {notifications.map((notif) => {
                const Icon = iconMap[notif.type] || Bell;
                return (
                  <button
                    key={notif.id}
                    className={cn(
                      "w-full text-left px-3 py-3 flex items-start gap-3 hover:bg-muted/40 transition-colors",
                      !notif.read && "bg-primary/5"
                    )}
                    onClick={() => {
                      const url = (notif as any).url as string | undefined;
                      if (!notif.read) markRead.mutate(notif.id);
                      const resolvedUrl = url || "/notifications";
                      const shouldOpenDetail = notif.type === "marketing" || resolvedUrl.startsWith("/notifications");
                      setOpen(false);
                      navigate(shouldOpenDetail ? `/notifications?notificationId=${notif.id}` : resolvedUrl);
                    }}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                        !notif.read ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold truncate">{notif.title}</p>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notif.message}
                      </p>
                    </div>

                    {!notif.read && (
                      <Badge variant="secondary" className="text-[10px] bg-primary/15 text-primary shrink-0 mt-0.5">
                        New
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No notifications yet
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
