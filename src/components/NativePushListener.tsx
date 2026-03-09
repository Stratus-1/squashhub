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
    let localActionHandle: any;
    let isActive = true;
    const foregroundChannelId = "gb_foreground";

    (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const { App } = await import("@capacitor/app");
      const { LocalNotifications } = await import("@capacitor/local-notifications");

      appStateHandle = await App.addListener("appStateChange", (state) => {
        isActive = !!state?.isActive;
      });

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
                title: notification?.title || "GB Squash",
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
        (event: any) => {
          const url = event?.notification?.data?.url || "/notifications";
          navigate(url);
        }
      );

      localActionHandle = await LocalNotifications.addListener("localNotificationActionPerformed", (event: any) => {
        const url = event?.notification?.extra?.url || "/notifications";
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
  }, [navigate]);

  return null;
}
