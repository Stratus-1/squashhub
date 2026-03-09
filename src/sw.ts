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
// This fires even when the browser tab is closed (background delivery).
// On iOS PWA, the app MUST be installed to Home Screen for push to work.
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data: Record<string, unknown> = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: "GB Squash", body: event.data.text() };
  }

  const title = (data?.title as string) || "GB Squash";
  const url = (data?.url as string) || "/notifications";
  const extra =
    data && typeof (data as any).data === "object" && (data as any).data && !Array.isArray((data as any).data)
      ? ((data as any).data as Record<string, unknown>)
      : {};
  const options: any = {
    body: (data?.body as string) || "",
    icon: (data?.icon as string) || "/pwa-192x192.png",
    badge: (data?.badge as string) || "/pwa-192x192.png",
    data: { ...extra, url },
    vibrate: [100, 50, 100],
    tag: (data?.tag as string) || "gb-squash-notification",
    renotify: true,
    // Keep notification visible until user interacts (critical for background delivery)
    requireInteraction: true,
    actions: [{ action: "open", title: "Open" }],
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
        // Try to focus an existing window
        for (const client of clients) {
          if ("navigate" in client && "focus" in client) {
            (client as WindowClient).navigate(url);
            return (client as WindowClient).focus();
          }
        }
        // No existing window — open a new one
        return self.clients.openWindow(url);
      })
  );
});

// Keep the service worker alive for push events (helps on some Android devices)
self.addEventListener("pushsubscriptionchange", (event: any) => {
  // Re-subscribe if the browser revokes the subscription
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription?.options ?? { userVisibleOnly: true })
      .then((newSub) => {
        // Post to clients so the app can update the server
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
