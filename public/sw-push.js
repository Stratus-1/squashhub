// Push notification service worker (loaded alongside vite-plugin-pwa SW)
self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || "",
    icon: data.icon || "/pwa-192x192.png",
    badge: data.badge || "/pwa-192x192.png",
    data: { url: data.url || "/" },
    vibrate: [100, 50, 100],
    actions: [{ action: "open", title: "Open" }],
    tag: data.tag || "gb-squash-notification",
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "GB Squash", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus existing window if available
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Open new window
        return self.clients.openWindow(url);
      })
  );
});

// Background sync for offline actions
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-notifications") {
    event.waitUntil(
      // Re-fetch notifications when back online
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: "SYNC_NOTIFICATIONS" })
        );
      })
    );
  }
});
