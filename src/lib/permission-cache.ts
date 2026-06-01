// Persistent device-side cache of permission/install prompt decisions
// so we never re-ask after the user has already accepted or dismissed.
//
// Keys live in localStorage (survives reloads, install, app updates).
// Values: "granted" | "denied" | "dismissed" | timestamp string.

const PREFIX = "sh.perm.";

export type PermissionKey =
  | "notifications" // push / web notifications
  | "geolocation" // court check-in / proximity
  | "camera" // QR / face check-in
  | "microphone" // marker voice
  | "install-prompt-ios" // iOS A2HS instruction sheet
  | "install-prompt-android"; // Android beforeinstallprompt

export type Decision = "granted" | "denied" | "dismissed" | "pending";

export function getDecision(key: PermissionKey): Decision | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(PREFIX + key);
    return (v as Decision) || null;
  } catch {
    return null;
  }
}

export function setDecision(key: PermissionKey, decision: Decision): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, decision);
    window.localStorage.setItem(PREFIX + key + ".at", String(Date.now()));
  } catch {
    // ignore quota / private mode
  }
}

export function clearDecision(key: PermissionKey): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PREFIX + key);
    window.localStorage.removeItem(PREFIX + key + ".at");
  } catch {
    // ignore
  }
}

/** Should we ask the user again? Re-ask "dismissed" after 14 days; never re-ask granted/denied. */
export function shouldAsk(key: PermissionKey): boolean {
  const d = getDecision(key);
  if (d === "granted" || d === "denied") return false;
  if (d === "dismissed") {
    try {
      const at = Number(window.localStorage.getItem(PREFIX + key + ".at") || "0");
      const days = (Date.now() - at) / (1000 * 60 * 60 * 24);
      return days > 14;
    } catch {
      return true;
    }
  }
  return true;
}
