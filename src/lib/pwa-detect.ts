// PWA runtime detection helpers.
//
// We need to know three things at runtime:
//   1. Is the app currently running as an installed PWA (standalone)?
//   2. Did this device previously install the PWA? (We cache a flag.)
//   3. Has the user just uninstalled and re-opened in the browser?
//      (beforeinstallprompt firing again is the signal — we then clear
//       any stale "granted" install-prompt decisions so the install card
//       can re-appear.)
//
// All flags live in localStorage so they survive reloads and SW updates,
// but they are device-local — uninstalling on iOS/Android clears the
// installed PWA, but localStorage in Safari/Chrome on that same device
// usually survives. The `beforeinstallprompt` reset path covers the
// "installed → deleted → reopened in browser" case.

import { clearDecision, setDecision } from "./permission-cache";

const KEY_INSTALLED = "sh.pwa.installed";
const KEY_INSTALLED_AT = "sh.pwa.installed.at";

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    if (window.matchMedia?.("(display-mode: fullscreen)").matches) return true;
    if (window.matchMedia?.("(display-mode: minimal-ui)").matches) return true;
    // iOS Safari legacy flag
    if ((window.navigator as any).standalone === true) return true;
  } catch {
    // ignore
  }
  return false;
}

export function markInstalled(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_INSTALLED, "1");
    window.localStorage.setItem(KEY_INSTALLED_AT, String(Date.now()));
  } catch {
    // ignore
  }
}

export function wasInstalled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY_INSTALLED) === "1";
  } catch {
    return false;
  }
}

export function clearInstalled(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY_INSTALLED);
    window.localStorage.removeItem(KEY_INSTALLED_AT);
  } catch {
    // ignore
  }
}

/**
 * Call this when `beforeinstallprompt` fires. Browsers only fire that
 * event when the app is NOT currently installed. If we previously
 * recorded "installed" or "granted", it means the user deleted the app
 * — reset those flags so we can prompt them to reinstall.
 */
export function handleReinstallSignal(): void {
  if (wasInstalled()) {
    clearInstalled();
    clearDecision("install-prompt-android");
    clearDecision("install-prompt-ios");
  } else {
    // Also clear any stale "granted" decisions if we are clearly not
    // running standalone — granted but not standalone == uninstalled.
    if (!isStandalone()) {
      clearDecision("install-prompt-android");
      clearDecision("install-prompt-ios");
    }
  }
}

/** Persist install on `appinstalled` browser event. */
export function recordInstalled(): void {
  markInstalled();
  setDecision("install-prompt-android", "granted");
  setDecision("install-prompt-ios", "granted");
}
