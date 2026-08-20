// UPDATE flow (deliberately separate from the INSTALL flow).
//
// A waiting service worker means a newer deployed build is ready. We never
// activate it silently: the user gets "Update now / Later", and we never
// reload while live scoring is in progress.

export const SW_UPDATE_EVENT = "sh:sw-update-available";

type UpdateFn = (reload?: boolean) => Promise<void>;

let applyFn: UpdateFn | null = null;

/** Called by pwa-register when workbox reports a waiting worker. */
export function setUpdateHandler(fn: UpdateFn): void {
  applyFn = fn;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT));
  }
}

export function hasPendingUpdate(): boolean {
  return applyFn !== null;
}

const RETURN_KEY = "sh.pwa.updateReturnTo";

/** Activate the waiting SW and reload. Caller must confirm with the user. */
export async function applyPendingUpdate(): Promise<void> {
  const fn = applyFn;
  if (!fn) return;
  applyFn = null;
  // Some installed shells (notably Android) relaunch at start_url after the
  // new worker takes control. Remember where the user was so we can restore it.
  try {
    const here = window.location.pathname + window.location.search + window.location.hash;
    if (here && here !== "/") sessionStorage.setItem(RETURN_KEY, here);
  } catch {
    // ignore
  }
  await fn(true);
}

/**
 * Called on boot: if an update reload dropped us on the launch URL instead of
 * the page the user was on, put them back without touching auth state.
 */
export function restoreRouteAfterUpdate(): void {
  try {
    const target = sessionStorage.getItem(RETURN_KEY);
    if (!target) return;
    sessionStorage.removeItem(RETURN_KEY);
    const here = window.location.pathname + window.location.search + window.location.hash;
    if (here === target) return;
    if (window.location.pathname !== "/") return;
    window.history.replaceState(null, "", target);
  } catch {
    // ignore
  }
}


export function dismissPendingUpdate(): void {
  // Keep applyFn so the user can still update later from the same session
  // (the banner itself is what gets hidden).
}
