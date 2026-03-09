/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA fallback (avoid capturing OAuth paths)
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/~oauth/],
  })
);

// ─── Web Push notifications (PWA / Chrome on Android / Safari on iOS 16.4+) ───
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data: Record<string, unknown> = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: "GB Squash", body: event.data.text() };
  }

  const title = (data?.title as string) || "GB Squash";
  const rawUrl = (data?.url as string) || "/notifications";
  const notificationId = (data?.tag as string) || "";
  const extra =
    data && typeof (data as any).data === "object" && (data as any).data && !Array.isArray((data as any).data)
      ? ((data as any).data as Record<string, unknown>)
      : {};

  // Build the deep-link URL: append notificationId so the app can open the right view
  let targetUrl = rawUrl;
  if (notificationId && /^[0-9a-f-]{36}$/i.test(notificationId)) {
    const sep = rawUrl.includes("?") ? "&" : "?";
    targetUrl = `${rawUrl}${sep}notificationId=${notificationId}`;
  }

  const options: NotificationOptions & { actions?: any[]; vibrate?: number[]; tag?: string; renotify?: boolean; requireInteraction?: boolean; data?: any } = {
    body: (data?.body as string) || "",
    icon: (data?.icon as string) || "/pwa-192x192.png",
    badge: (data?.badge as string) || "/pwa-192x192.png",
    data: { ...extra, url: targetUrl, notificationId },
    vibrate: [100, 50, 100],
    tag: (data?.tag as string) || "gb-squash-notification",
    renotify: true,
    requireInteraction: true,
    actions: [{ action: "open", title: "Open" }],
    // No silent flag — default sound plays on supported platforms
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Tap handler — works on Android Chrome + iOS Safari PWA
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = (event.notification as any).data?.url || "/notifications";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("navigate" in client && "focus" in client) {
            (client as WindowClient).navigate(url);
            return (client as WindowClient).focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});

// Re-subscribe if the browser revokes the subscription
self.addEventListener("pushsubscriptionchange", (event: any) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription?.options ?? { userVisibleOnly: true })
      .then((newSub) => {
        return self.clients.matchAll().then((clients) => {
          for (const client of clients) {
            client.postMessage({
              type: "PUSH_SUBSCRIPTION_CHANGED",
              subscription: newSub.toJSON(),
            });
          }
        });
      })
  );
});
