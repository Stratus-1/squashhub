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
  if (!Capacitor.isNativePlatform()) {
    const safePath = pathAndSearch.startsWith("/") && !pathAndSearch.startsWith("//")
      ? pathAndSearch
      : `/${pathAndSearch.replace(/^\/+/, "")}`;
    // Prefer the current tenant origin (e.g. https://gb.squashhub.co.za) so
    // the payer is returned to the same club subdomain they paid from.
    let origin = PUBLIC_APP_ORIGIN;
    if (typeof window !== "undefined" && window.location?.origin) {
      const host = window.location.hostname;
      if (
        host === "squashhub.co.za" ||
        host.endsWith(".squashhub.co.za") ||
        host.endsWith(".lovable.app") ||
        host === "localhost"
      ) {
        origin = window.location.origin.replace(/\/+$/, "");
      }
    }
    return `${origin}${safePath}`;
  }
  const nativePath = pathAndSearch.replace(/^\/+/, "");
  return `${APP_SCHEME}://${nativePath}`;
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
