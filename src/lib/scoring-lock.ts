// Global "live scoring in progress" lock.
//
// Thin wrapper over the generic activity registry (src/lib/app-activity.ts)
// so existing marker code keeps working unchanged. While set, the PWA
// service-worker poller skips its `registration.update()` call, the update
// pill stays hidden, and a `beforeunload` guard is attached.

import { beginActivity, isBusy } from "./app-activity";

let ends: Array<() => void> = [];

export function setScoringActive(on: boolean): void {
  if (typeof window === "undefined") return;
  if (on) {
    ends.push(beginActivity("scoring"));
  } else {
    const end = ends.pop();
    if (end) end();
  }
}

export function isScoringActive(): boolean {
  return ends.length > 0;
}

/** Any user activity (scoring, forms, uploads, open dialogs, mutations). */
export { isBusy };
