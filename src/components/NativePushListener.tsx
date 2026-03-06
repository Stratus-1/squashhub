import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useNavigate } from "react-router-dom";

export function NativePushListener() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let actionHandle: any;

    (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");

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
    };
  }, [navigate]);

  return null;
}

