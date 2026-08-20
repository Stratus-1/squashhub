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

/** Activate the waiting SW and reload. Caller must confirm with the user. */
export async function applyPendingUpdate(): Promise<void> {
  const fn = applyFn;
  if (!fn) return;
  applyFn = null;
  await fn(true);
}

export function dismissPendingUpdate(): void {
  // Keep applyFn so the user can still update later from the same session
  // (the banner itself is what gets hidden).
}
