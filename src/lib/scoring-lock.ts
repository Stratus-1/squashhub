// Global "live scoring in progress" lock.
//
// While set, the PWA service-worker auto-update poller will skip its
// `registration.update()` call so a new SW cannot activate / reload the
// page mid-rally. We also wire a `beforeunload` guard so accidental
// taps / refreshes prompt confirmation.
//
// State is intentionally module-local (not React state) so non-React
// code (pwa-register) can read it cheaply.

let active = 0;

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  // Most browsers ignore custom text now, but returnValue is still required.
  e.returnValue = "A match is being scored. Leave anyway?";
  return e.returnValue;
}

export function setScoringActive(on: boolean): void {
  if (typeof window === "undefined") return;
  if (on) {
    active += 1;
    if (active === 1) {
      window.addEventListener("beforeunload", onBeforeUnload);
    }
  } else {
    active = Math.max(0, active - 1);
    if (active === 0) {
      window.removeEventListener("beforeunload", onBeforeUnload);
    }
  }
}

export function isScoringActive(): boolean {
  return active > 0;
}
