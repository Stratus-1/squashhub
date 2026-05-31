import { Capacitor } from "@capacitor/core";

const APP_SCHEME = "gbsquash";
const PENDING_YOCO_SESSION_KEY = "gbsquash.pendingYocoSession";

type PendingYocoSession = {
  sessionId: string;
  returnPath: string;
  createdAt: number;
};

export function buildYocoReturnUrl(pathAndSearch: string) {
  if (!Capacitor.isNativePlatform()) {
    return `${window.location.origin}${pathAndSearch}`;
  }

  const nativePath = pathAndSearch.replace(/^\/+/, "");
  return `${APP_SCHEME}://${nativePath}`;
}

export async function openYocoCheckout(url: string) {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }

  window.location.href = url;
}

export function rememberPendingYocoSession(sessionId: string, returnPath: string) {
  if (!sessionId) return;
  localStorage.setItem(
    PENDING_YOCO_SESSION_KEY,
    JSON.stringify({ sessionId, returnPath, createdAt: Date.now() } satisfies PendingYocoSession),
  );
}

export function getPendingYocoSession() {
  try {
    const raw = localStorage.getItem(PENDING_YOCO_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingYocoSession;
    if (!parsed?.sessionId || Date.now() - Number(parsed.createdAt || 0) > 60 * 60 * 1000) {
      localStorage.removeItem(PENDING_YOCO_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(PENDING_YOCO_SESSION_KEY);
    return null;
  }
}

export function clearPendingYocoSession(sessionId?: string) {
  const pending = getPendingYocoSession();
  if (!sessionId || pending?.sessionId === sessionId) {
    localStorage.removeItem(PENDING_YOCO_SESSION_KEY);
  }
}