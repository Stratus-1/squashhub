const PUSH_WORKER_URL = "/push-service-worker.js";
const PUSH_WORKER_TIMEOUT_MS = 10_000;

function isBlockedContext(): boolean {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return true;
  if (!import.meta.env.PROD) return true;

  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }

  if (window.location.protocol === "capacitor:" || window.location.protocol === "file:") return true;

  const host = window.location.hostname.toLowerCase();
  return (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  );
}

export function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (isBlockedContext()) return Promise.resolve(null);
  return navigator.serviceWorker.register(PUSH_WORKER_URL, { scope: "/" });
}

export async function getPushServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const registrationPromise = registerPushServiceWorker().then((registration) => {
    if (!registration) throw new Error("Browser notifications are unavailable here");
    return registration;
  });
  const timeoutPromise = new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error("Notification setup timed out")), PUSH_WORKER_TIMEOUT_MS);
  });
  return Promise.race([registrationPromise, timeoutPromise]);
}