import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushPermissionState = "prompt" | "granted" | "denied" | "unsupported";

export function usePushNotifications() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<PushPermissionState>("prompt");
  const [localSubscribed, setLocalSubscribed] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false); // server-backed subscription (required for delivery)
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PushPermissionState);

    // Check existing local subscription (browser).
    navigator.serviceWorker.ready.then(async (registration) => {
      const sub = await registration.pushManager.getSubscription();
      setLocalSubscribed(!!sub);
    });
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setIsSubscribed(false);
      return;
    }

    (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        if (!sub) {
          setLocalSubscribed(false);
          setIsSubscribed(false);
          return;
        }

        setLocalSubscribed(true);

        // Confirm the subscription is stored server-side; without this, no push can be delivered.
        const { data, error } = await supabase
          .from("push_subscriptions")
          .select("id")
          .eq("user_id", user.id)
          .eq("endpoint", sub.endpoint)
          .maybeSingle();
        if (error) throw error;
        setIsSubscribed(!!data?.id);
      } catch (error) {
        if (import.meta.env.DEV) console.error("Push subscription check failed:", error);
        setIsSubscribed(false);
      }
    })();
  }, [user?.id]);

  const subscribe = useCallback(async () => {
    if (!user || permission === "unsupported") return false;

    setLoading(true);
    try {
      // Request notification permission
      const result = await Notification.requestPermission();
      setPermission(result as PushPermissionState);

      if (result !== "granted") {
        setLoading(false);
        return false;
      }

      // Get VAPID public key from edge function
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const vapidResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/push-notifications?action=vapid-public-key`,
        { headers: { "Content-Type": "application/json" } }
      );
      if (!vapidResponse.ok) throw new Error("Failed to fetch VAPID key");
      const { publicKey } = await vapidResponse.json();
      if (!publicKey) throw new Error("Missing VAPID public key");

      // Register push subscription
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Store subscription on server
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/push-notifications?action=subscribe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        }
      );

      // Verify server storage (required for delivery).
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("endpoint", subscription.endpoint)
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) throw new Error("Subscription was created locally but not saved on the server");

      setLocalSubscribed(true);
      setIsSubscribed(true);
      setLoading(false);
      return true;
    } catch (error) {
      if (import.meta.env.DEV) console.error("Push subscription failed:", error);
      // Avoid a false-positive local subscription that the server can't deliver to.
      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        await sub?.unsubscribe?.();
      } catch {
        // ignore
      }
      setLocalSubscribed(false);
      setLoading(false);
      return false;
    }
  }, [user, permission]);

  const unsubscribe = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const { data: { session } } = await supabase.auth.getSession();
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/push-notifications?action=unsubscribe`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          }
        );
        if (!res.ok) {
          // Best-effort; continue to clear locally so the UI doesn't show "enabled" incorrectly.
          if (import.meta.env.DEV) console.warn("Server unsubscribe failed");
        }

        await subscription.unsubscribe();
      }

      setLocalSubscribed(false);
      setIsSubscribed(false);
    } catch (error) {
      if (import.meta.env.DEV) console.error("Push unsubscribe failed:", error);
    }
    setLoading(false);
  }, [user]);

  return { permission, isSubscribed, localSubscribed, loading, subscribe, unsubscribe };
}
