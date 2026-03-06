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
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PushPermissionState);

    // Check existing subscription
    navigator.serviceWorker.ready.then(async (registration) => {
      const sub = await registration.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    });
  }, []);

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
      const { publicKey } = await vapidResponse.json();

      // Register push subscription
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Store subscription on server
      const { data: { session } } = await supabase.auth.getSession();
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

      setIsSubscribed(true);
      setLoading(false);
      return true;
    } catch (error) {
      console.error("Push subscription failed:", error);
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

        await fetch(
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

        await subscription.unsubscribe();
      }

      setIsSubscribed(false);
    } catch (error) {
      console.error("Push unsubscribe failed:", error);
    }
    setLoading(false);
  }, [user]);

  return { permission, isSubscribed, loading, subscribe, unsubscribe };
}
