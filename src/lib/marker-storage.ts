export const MARKER_CONFIG_KEY = "marker:active-config:v1";
export const MARKER_STATE_KEY = "marker:active-state:v1";

export function clearMarkerSession() {
  try {
    localStorage.removeItem(MARKER_CONFIG_KEY);
    localStorage.removeItem(MARKER_STATE_KEY);
  } catch {}
}

export function hasActiveMarkerSession(): boolean {
  try {
    return !!localStorage.getItem(MARKER_CONFIG_KEY);
  } catch {
    return false;
  }
}
