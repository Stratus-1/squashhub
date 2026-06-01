// Manual PWA service-worker registration.
//
// Rules (see PWA constraint memory + lovable PWA guidance):
//  • NEVER register inside an iframe (Lovable editor preview).
//  • NEVER register on Lovable preview hostnames.
//  • Only register on production hosts (squashhub.co.za + subdomains, squashhub.app + subdomains, lovable.app for the published site).
//  • Per project memory: PWA install prompts are restricted to club subdomains,
//    but the SW itself is fine to register on root so installable manifest works
//    everywhere. We gate the *prompt* separately.
//
// Capacitor native runs the same web bundle; we never want a SW there.

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // 1. Iframe guard
  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }
  if (inIframe) return;

  // 2. Native Capacitor guard (capacitor:// or file:// origins)
  const proto = window.location.protocol;
  if (proto === "capacitor:" || proto === "file:") return;

  // 3. Preview host guard
  const host = window.location.hostname;
  const isPreview =
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    host === "localhost" ||
    host === "127.0.0.1";
  if (isPreview) {
    // Aggressively unregister any leftover SWs in preview
    navigator.serviceWorker.getRegistrations()
      .then((rs) => rs.forEach((r) => void r.unregister()))
      .catch(() => {});
    return;
  }

  // 4. Dynamic import so the virtual module only loads in prod builds.
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onRegisteredSW(_swUrl, registration) {
          // Poll every 60s for a new SW (per project's aggressive update memory).
          if (registration) {
            setInterval(() => {
              registration.update().catch(() => {});
            }, 60_000);
          }
        },
        onNeedRefresh() {
          // autoUpdate=true: workbox will skipWaiting/clientsClaim itself.
        },
        onOfflineReady() {
          // no-op
        },
      });
    })
    .catch(() => {
      // virtual module unavailable in dev — fine.
    });
}
