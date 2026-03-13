import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function NativePushListener() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!user?.id) return;

    let actionHandle: any;
    let receiveHandle: any;
    let appStateHandle: any;
    let localActionHandle: any;
    let isActive = true;
    const foregroundChannelId = "gb_foreground";

    const looksLikeUuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    const markRead = async (payload: any) => {
      try {
        const tag = String(payload?.tag || payload?.notification_id || "");
        if (!tag || !looksLikeUuid(tag)) return;
        await supabase.from("notifications").update({ read: true }).eq("id", tag).eq("user_id", user.id);
      } catch {
        // ignore
      }
    };

    (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const { App } = await import("@capacitor/app");
      const { LocalNotifications } = await import("@capacitor/local-notifications");

      appStateHandle = await App.addListener("appStateChange", (state) => {
        isActive = !!state?.isActive;
      });

      // Ensure the remote push channel exists (Android). Using a dedicated channel avoids “importance can’t change” issues.
      if (Capacitor.getPlatform() === "android") {
        try {
          await PushNotifications.createChannel({
            id: "gb_alerts",
            name: "SquashHub Alerts",
            description: "Challenges, matches, and reminders",
            importance: 4,
            visibility: 1,
            vibration: true,
          } as any);
        } catch {
          // ignore
        }
      }

      // When a push arrives while the app is in the foreground, iOS/Android often won't show a banner.
      // Show a local notification as a best-effort fallback so members *see* the alert immediately.
      receiveHandle = await PushNotifications.addListener("pushNotificationReceived", async (notification: any) => {
        if (!isActive) return;
        try {
          await LocalNotifications.requestPermissions();

          // Ensure a dedicated foreground channel exists on Android (new channel avoids “importance can’t be changed” issues).
          if (Capacitor.getPlatform() === "android") {
            try {
              await LocalNotifications.createChannel({
                id: foregroundChannelId,
                name: "Foreground alerts",
                description: "Heads-up alerts while the app is open",
                importance: 5,
                visibility: 1,
                vibration: true,
              } as any);
            } catch {
              // ignore
            }
          }

          const url = notification?.data?.url || "/notifications";
          await LocalNotifications.schedule({
            notifications: [
              {
                id: Date.now(),
                title: notification?.title || "SquashHub",
                body: notification?.body || "",
                extra: { ...(notification?.data || {}), url },
                ...(Capacitor.getPlatform() === "android" ? { channelId: foregroundChannelId } : {}),
                // Schedule slightly in the future for more consistent foreground delivery across platforms.
                schedule: { at: new Date(Date.now() + 250) },
              } as any,
            ],
          });
        } catch {
          // ignore
        }
      });

      actionHandle = await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        async (event: any) => {
          const url = event?.notification?.data?.url || "/notifications";
          await markRead(event?.notification?.data);
          navigate(url);
        }
      );

      localActionHandle = await LocalNotifications.addListener("localNotificationActionPerformed", async (event: any) => {
        const url = event?.notification?.extra?.url || "/notifications";
        await markRead(event?.notification?.extra);
        navigate(url);
      });
    })().catch(() => {});

    return () => {
      try {
        actionHandle?.remove?.();
      } catch {
        // ignore
      }
      try {
        receiveHandle?.remove?.();
      } catch {
        // ignore
      }
      try {
        appStateHandle?.remove?.();
      } catch {
        // ignore
      }
      try {
        localActionHandle?.remove?.();
      } catch {
        // ignore
      }
    };
  }, [navigate, user?.id]);

  return null;
}
