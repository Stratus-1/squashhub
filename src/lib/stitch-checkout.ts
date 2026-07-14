import { Capacitor } from "@capacitor/core";

const APP_SCHEME = "gbsquash";
const PUBLIC_APP_ORIGIN = "https://squashhub.co.za";
const PENDING_STITCH_SESSION_KEY = "gbsquash.pendingStitchSession";

type PendingStitchSession = {
  sessionId: string;
  returnPath: string;
  createdAt: number;
};

export function buildStitchReturnUrl(pathAndSearch: string) {
  if (Capacitor.isNativePlatform()) {
    const nativePath = pathAndSearch.replace(/^\/+/, "");
    return `${APP_SCHEME}://${nativePath}`;
  }

  const safePath = pathAndSearch.startsWith("/") && !pathAndSearch.startsWith("//")
    ? pathAndSearch
    : `/${pathAndSearch.replace(/^\/+/, "")}`;

  // Figure out where the payer should ultimately land (their current subdomain).
  let originHere = PUBLIC_APP_ORIGIN;
  if (typeof window !== "undefined" && window.location?.origin) {
    const host = window.location.hostname;
    if (
      host === "squashhub.co.za" ||
      host.endsWith(".squashhub.co.za") ||
      host.endsWith(".lovable.app") ||
      host === "localhost"
    ) {
      originHere = window.location.origin.replace(/\/+$/, "");
    }
  }
  const finalTarget = `${originHere}${safePath}`;

  // Stitch's redirect whitelist only allows exact URL matches and caps at 5
  // entries — so we always hand Stitch the same canonical forwarder URL and
  // pass the real destination in `?to=`. /pay/return validates the host and
  // bounces the payer (plus any Stitch query params) to their subdomain.
  // On the lovable.app preview host we forward through the preview origin so
  // testing works without touching production redirects.
  let forwarderOrigin = PUBLIC_APP_ORIGIN;
  if (typeof window !== "undefined" && window.location?.hostname?.endsWith(".lovable.app")) {
    forwarderOrigin = "https://squashhub.lovable.app";
  }
  return `${forwarderOrigin}/pay/return?to=${encodeURIComponent(finalTarget)}`;
}


export async function openStitchCheckout(url: string) {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  try {
    if (window.top && window.top !== window.self) {
      window.top.location.href = url;
      return;
    }
  } catch { /* cross-origin frame */ }
  window.location.assign(url);
}

export function rememberPendingStitchSession(sessionId: string, returnPath: string) {
  if (!sessionId) return;
  localStorage.setItem(
    PENDING_STITCH_SESSION_KEY,
    JSON.stringify({ sessionId, returnPath, createdAt: Date.now() } satisfies PendingStitchSession),
  );
}

export function getPendingStitchSession() {
  try {
    const raw = localStorage.getItem(PENDING_STITCH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingStitchSession;
    if (!parsed?.sessionId || Date.now() - Number(parsed.createdAt || 0) > 60 * 60 * 1000) {
      localStorage.removeItem(PENDING_STITCH_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(PENDING_STITCH_SESSION_KEY);
    return null;
  }
}

export function clearPendingStitchSession(sessionId?: string) {
  const pending = getPendingStitchSession();
  if (!sessionId || pending?.sessionId === sessionId) {
    localStorage.removeItem(PENDING_STITCH_SESSION_KEY);
  }
}
