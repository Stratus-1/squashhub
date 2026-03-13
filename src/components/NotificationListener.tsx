import { useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
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

/** Play a short notification chime when the tab is in focus. */
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // AudioContext not available — ignore
  }
}

function buildTargetUrl(row: NotificationRow) {
  const resolvedUrl = String(row.url || "/notifications");
  const shouldOpenDetail = row.type === "marketing" || resolvedUrl.startsWith("/notifications");
  return shouldOpenDetail ? `/notifications?notificationId=${row.id}` : resolvedUrl;
}

export function NotificationListener() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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

          // Play sound in the browser
          playNotificationSound();

          const targetUrl = buildTargetUrl(row);

          // In-app toast with action button
          toast(row.title || "Notification", {
            description: row.message,
            action: {
              label: "View",
              onClick: () => navigate(targetUrl),
            },
          });

          queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
          queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", user.id] });

          // OS-level notification (foreground only)
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              const n = new Notification(row.title || "SquashHub", {
                body: row.message,
                icon: "/pwa-192x192.png",
                data: { url: targetUrl, notificationId: row.id },
              });
              n.onclick = () => {
                try {
                  window.focus();
                  navigate(targetUrl);
                } catch {
                  // ignore
                }
              };
            } catch {
              // ignore
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
  }, [queryClient, user?.id, navigate]);

  return null;
}
