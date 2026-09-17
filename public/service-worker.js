// One-release cleanup worker for the former Workbox app-shell cache.
// Home-screen installation remains available through the web manifest.
function isSquashHubAppCache(name) {
  const isWorkboxBucket = /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name);
  const isKnownHtmlBucket = name === "html-pages";
  return (isWorkboxBucket && name.endsWith(self.registration.scope)) || isKnownHtmlBucket;
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        const appCacheNames = cacheNames.filter(isSquashHubAppCache);
        await Promise.allSettled(appCacheNames.map((name) => caches.delete(name)));
        await self.clients.claim();
        const windowClients = await self.clients.matchAll({ type: "window" });
        await Promise.allSettled(windowClients.map((client) => client.navigate(client.url)));
      } finally {
        await self.registration.unregister();
      }
    })(),
  ),
);
