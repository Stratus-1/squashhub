// Blank-screen recovery for installed PWAs / long-lived desktop shells.
//
// Symptom (desktop PWA, Aug 2026): the installed app opens to a white screen.
// Cause: the service worker still holds a cached index.html (or a stale
// precache) that references hashed JS chunks which no longer exist after a
// deploy. The module fails to load, React never mounts, nothing renders.
//
// Recovery: when a script/chunk fails to load, purge the caches, unregister
// service workers and reload once. Guarded by sessionStorage so a genuinely
// broken build can never turn into a reload loop.

const FLAG = "sh.pwa.recovered";

async function purgeAndReload(): Promise<void> {
  try {
    if (sessionStorage.getItem(FLAG) === "1") return; // already tried this session
    sessionStorage.setItem(FLAG, "1");
  } catch {
    return;
  }

  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch {
    /* ignore */
  }

  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    /* ignore */
  }

  const url = new URL(window.location.href);
  url.searchParams.set("sh-recover", Date.now().toString(36));
  window.location.replace(url.toString());
}

function looksLikeChunkFailure(message: string): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk .* failed/i.test(
    message,
  );
}

export function installBlankScreenRecovery(): void {
  if (typeof window === "undefined") return;

  // Vite's own preload failure event — the most reliable signal.
  window.addEventListener("vite:preloadError", () => {
    void purgeAndReload();
  });

  window.addEventListener("error", (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "SCRIPT" || target.tagName === "LINK")) {
      void purgeAndReload();
      return;
    }
    if (e.message && looksLikeChunkFailure(e.message)) void purgeAndReload();
  }, true);

  window.addEventListener("unhandledrejection", (e) => {
    const reason: unknown = (e as PromiseRejectionEvent).reason;
    const msg = typeof reason === "string" ? reason : (reason as Error)?.message || "";
    if (looksLikeChunkFailure(msg)) void purgeAndReload();
  });

  // Nothing rendered after 12s in an installed shell → treat as a blank screen.
  window.setTimeout(() => {
    const root = document.getElementById("root");
    if (root && root.childElementCount === 0) void purgeAndReload();
  }, 12_000);

  // Clear the guard once the app is clearly alive.
  window.setTimeout(() => {
    try {
      const root = document.getElementById("root");
      if (root && root.childElementCount > 0) sessionStorage.removeItem(FLAG);
    } catch {
      /* ignore */
    }
  }, 20_000);
}
