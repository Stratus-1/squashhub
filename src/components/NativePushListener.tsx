import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useNavigate } from "react-router-dom";

export function NativePushListener() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let actionHandle: any;
    let receiveHandle: any;
    let appStateHandle: any;
    let isActive = true;

    (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const { App } = await import("@capacitor/app");
      const { LocalNotifications } = await import("@capacitor/local-notifications");

      appStateHandle = await App.addListener("appStateChange", (state) => {
        isActive = !!state?.isActive;
      });

      // When a push arrives while the app is in the foreground, Android often won't display it in the notification shade.
      // Show a local notification as a best-effort fallback (Android only).
      if (Capacitor.getPlatform() === "android") {
        receiveHandle = await PushNotifications.addListener("pushNotificationReceived", async (notification: any) => {
          if (!isActive) return;
          try {
            await LocalNotifications.requestPermissions();
            await LocalNotifications.schedule({
              notifications: [
                {
                  id: Date.now(),
                  title: notification?.title || "GB Squash",
                  body: notification?.body || "",
                  extra: notification?.data || {},
                  channelId: "default_channel_id",
                } as any,
              ],
            });
          } catch {
            // ignore
          }
        });
      }

      actionHandle = await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (event: any) => {
          const url = event?.notification?.data?.url || "/notifications";
          navigate(url);
        }
      );
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
    };
  }, [navigate]);

  return null;
}
