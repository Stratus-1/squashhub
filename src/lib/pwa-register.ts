// Manual PWA service-worker registration.
//
// Rules (see PWA constraint memory + lovable PWA guidance):
//  • NEVER register inside an iframe (Lovable editor preview).
//  • NEVER register on Lovable preview hostnames.
//  • Never in a Capacitor native shell.
//
// Updates are surfaced to the user (Update now / Later) rather than being
// applied silently — see src/lib/pwa-update.ts.

import { setUpdateHandler } from "./pwa-update";

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
    host.includes("preview--") ||
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
      const updateSW = registerSW({
        immediate: true,
        onRegisteredSW(_swUrl, registration) {
          if (!registration) return;

          const check = () => {
            import("./scoring-lock")
              .then(({ isScoringActive }) => {
                if (isScoringActive()) return;
                registration.update().catch(() => {});
              })
              .catch(() => {
                registration.update().catch(() => {});
              });
          };

          // A waiting worker may already exist from a previous session
          // (desktop shells often stay open for days) — surface it now.
          if (registration.waiting) setUpdateHandler(updateSW);

          // Check straight away, then on every poll / focus / tab return.
          check();
          setInterval(check, 60_000);
          window.addEventListener("focus", check);
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") check();
          });
        },

        onNeedRefresh() {
          // A new build is waiting. Ask the user — never auto-reload.
          setUpdateHandler(updateSW);
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

