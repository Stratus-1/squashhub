import { useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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

export function NotificationListener() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`realtime:notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;
          toast(row.title || "Notification", { description: row.message });
          queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
          queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", user.id] });

          // Best-effort: show an OS-level notification when permission is granted (foreground only).
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              const resolvedUrl = String((row as any)?.url || "/notifications");
              const shouldOpenDetail = row.type === "marketing" || resolvedUrl.startsWith("/notifications");
              const targetUrl = shouldOpenDetail ? `/notifications?notificationId=${row.id}` : resolvedUrl;

              const n = new Notification(row.title || "Gordon's Bay Squash", {
                body: row.message,
                icon: "/pwa-192x192.png",
                data: { url: targetUrl, notificationId: row.id },
              });
              n.onclick = () => {
                try {
                  window.focus();
                  window.location.href = targetUrl;
                } catch {
                  // ignore
                }
              };
            } catch {
              // ignore (some platforms restrict programmatic notifications)
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
          queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, user?.id]);

  return null;
}
