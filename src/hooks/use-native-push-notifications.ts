import { useCallback, useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export type PushPermissionState = "prompt" | "granted" | "denied" | "unsupported";

const NATIVE_TOKEN_KEY = "native-push-token";
const PUSH_CHANNEL_ID = "gb_alerts";
const FOREGROUND_CHANNEL_ID = "gb_foreground";

export function useNativePushNotifications() {
  const [permission, setPermission] = useState<PushPermissionState>("prompt");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const platform = useMemo(() => {
    const p = Capacitor.getPlatform();
    return p === "android" || p === "ios" ? p : null;
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !platform) {
      setPermission("unsupported");
      return;
    }

    const token = localStorage.getItem(NATIVE_TOKEN_KEY);
    setIsSubscribed(!!token);
    // On native we can’t reliably check OS permission without the plugin; treat as prompt until subscribed.
    setPermission(token ? "granted" : "prompt");
  }, [platform]);

  const subscribe = useCallback(async () => {
    if (!Capacitor.isNativePlatform() || !platform) return false;

    setLoading(true);
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");

      const perm = await PushNotifications.requestPermissions();
      const receive = (perm as any)?.receive as string | undefined;
      if (receive !== "granted") {
        setPermission(receive === "denied" ? "denied" : "prompt");
        setLoading(false);
        return false;
      }

      setPermission("granted");

      // Android: ensure the default notification channel exists (required for proper notification bar behavior).
      if (platform === "android") {
        try {
          await PushNotifications.createChannel({
            id: PUSH_CHANNEL_ID,
            name: "SquashHub Alerts",
            description: "Challenges, matches, and reminders",
            importance: 4,
            visibility: 1,
            vibration: true,
          } as any);
        } catch {
          // ignore (older Android / already exists)
        }

        // Local notifications use a separate channel API; ensure it exists too so foreground fallback banners can appear.
        try {
          const { LocalNotifications } = await import("@capacitor/local-notifications");
          await LocalNotifications.createChannel({
            id: FOREGROUND_CHANNEL_ID,
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

      const tokenPromise = new Promise<string>((resolve, reject) => {
        let done = false;

        const timeout = setTimeout(() => {
          if (done) return;
          done = true;
          reject(new Error("Timed out waiting for device token"));
        }, 15000);

        let regHandle: any;
        let errHandle: any;

        regHandle = PushNotifications.addListener("registration", (t: any) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          try { regHandle?.remove?.(); } catch {}
          try { errHandle?.remove?.(); } catch {}
          resolve(t?.value as string);
        });

        errHandle = PushNotifications.addListener("registrationError", (e: any) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          try { regHandle?.remove?.(); } catch {}
          try { errHandle?.remove?.(); } catch {}
          reject(new Error(e?.message || "Registration error"));
        });
      });

      await PushNotifications.register();
      const token = await tokenPromise;

      const { data: { session } } = await supabase.auth.getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/push-notifications?action=native-subscribe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ token, platform }),
        }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed to subscribe device token");
      }

      localStorage.setItem(NATIVE_TOKEN_KEY, token);
      setIsSubscribed(true);
      setLoading(false);
      return true;
    } catch (error) {
      if (import.meta.env.DEV) console.error("Native push subscription failed:", error);
      setLoading(false);
      return false;
    }
  }, [platform]);

  const unsubscribe = useCallback(async () => {
    if (!Capacitor.isNativePlatform() || !platform) return;

    setLoading(true);
    try {
      const token = localStorage.getItem(NATIVE_TOKEN_KEY);
      if (token) {
        const { data: { session } } = await supabase.auth.getSession();
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        await fetch(
          `https://${projectId}.supabase.co/functions/v1/push-notifications?action=native-unsubscribe`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({ token }),
          }
        );
      }

      localStorage.removeItem(NATIVE_TOKEN_KEY);
      setIsSubscribed(false);
    } catch (error) {
      if (import.meta.env.DEV) console.error("Native push unsubscribe failed:", error);
    }
    setLoading(false);
  }, [platform]);

  return { permission, isSubscribed, loading, subscribe, unsubscribe };
}
