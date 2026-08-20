// Pure install-state logic for the desktop/mobile PWA install prompt.
//
// Kept free of React/DOM globals (except optional injected values) so it can
// be unit tested. The INSTALL flow lives here; the UPDATE flow is entirely
// separate (see src/lib/pwa-update.ts) and must never be conflated with it.

export const INSTALL_SNOOZE_KEY = "sh.install.snoozedUntil";
export const INSTALL_DONE_KEY = "sh.install.completed";

/** How long "Not now" suppresses the prompt. */
export const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type InstallPlatform = "desktop" | "android" | "ios" | "other";

export function detectPlatform(ua: string, hasTouch = false): InstallPlatform {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Mac/i.test(ua) && hasTouch) return "ios"; // iPadOS desktop-mode UA
  if (/Android/i.test(ua)) return "android";
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return "desktop";
  return "other";
}

/** iOS can only Add to Home Screen from Safari. */
export function isIosSafariUa(ua: string): boolean {
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV|Line\//i.test(ua);
}

export type InstallGateInput = {
  /** True when the app is already running installed (display-mode standalone). */
  standalone: boolean;
  /** True in a Capacitor native shell — never prompt. */
  native: boolean;
  /** True on Lovable preview / iframe / dev — never prompt. */
  preview: boolean;
  /** Current route is one where an overlay must not appear. */
  blockedRoute: boolean;
  /** Recorded `appinstalled` in the past on this device. */
  alreadyInstalled: boolean;
  /** Epoch ms until which the prompt is snoozed (0 = not snoozed). */
  snoozedUntil: number;
  /** A `beforeinstallprompt` event has been captured. */
  hasDeferredPrompt: boolean;
  now: number;
};

/**
 * Should the first-party install prompt be shown right now?
 * Requires a real captured `beforeinstallprompt` — we never render a
 * pseudo-install button that cannot actually install (except the iOS
 * guidance card, which is handled separately and explicitly).
 */
export function canShowInstallPrompt(i: InstallGateInput): boolean {
  if (i.native || i.preview) return false;
  if (i.standalone || i.alreadyInstalled) return false;
  if (i.blockedRoute) return false;
  if (i.snoozedUntil > i.now) return false;
  return i.hasDeferredPrompt;
}

export function snoozeUntil(now: number, ms: number = SNOOZE_MS): number {
  return now + ms;
}

/* ---------- storage helpers (browser side) ---------- */

export function readSnoozedUntil(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(window.localStorage.getItem(INSTALL_SNOOZE_KEY) || "0") || 0;
  } catch {
    return 0;
  }
}

export function writeSnooze(now = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INSTALL_SNOOZE_KEY, String(snoozeUntil(now)));
  } catch {
    /* ignore */
  }
}

export function clearSnooze(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(INSTALL_SNOOZE_KEY);
  } catch {
    /* ignore */
  }
}

export function markInstallCompleted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INSTALL_DONE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function readInstallCompleted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(INSTALL_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearInstallCompleted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(INSTALL_DONE_KEY);
  } catch {
    /* ignore */
  }
}

/** Preview / iframe / dev host detection — no install or SW work there. */
export function isPreviewContext(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  return (
    host.includes("id-preview--") ||
    host.includes("preview--") ||
    host.includes("lovableproject.com") ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
}
