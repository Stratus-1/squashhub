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

// Web Push notifications (PWA / Chrome on Android)
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data: any = null;
  try {
    data = event.data.json();
  } catch {
    data = { title: "GB Squash", body: event.data.text() };
  }

  const title = data?.title || "GB Squash";
  const options: any = {
    body: data?.body || "",
    icon: data?.icon || "/pwa-192x192.png",
    badge: data?.badge || "/pwa-192x192.png",
    data: { url: data?.url || "/notifications" },
    vibrate: [100, 50, 100],
    tag: data?.tag || "gb-squash-notification",
    renotify: true,
    actions: [{ action: "open", title: "Open" }],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = (event.notification as any).data?.url || "/notifications";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          // Focus existing window if available
          if ("navigate" in client && "focus" in client) {
            (client as WindowClient).navigate(url);
            return (client as WindowClient).focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});

