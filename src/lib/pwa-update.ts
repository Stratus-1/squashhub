// SAFE SILENT UPDATE flow (deliberately separate from the INSTALL flow).
//
// A waiting service worker means a newer deployed build is ready. We never
// activate it silently, and we never interrupt someone who is mid-task:
//   • the new build downloads in the background,
//   • nothing is shown while the user is busy (scoring, forms, uploads,
//     open dialogs, in-flight writes),
//   • at the next safe moment (route change, tab return, activity finishing)
//     a small corner pill offers the update,
//   • "Later" snoozes it for the session; a fresh app open re-offers it,
//   • "Update now" flushes pending writes, saves state, reloads, and returns
//     the user to the same screen,
//   • only releases marked `critical` force an immediate (still graceful)
//     reload.

import { isBusy } from "./app-activity";
import {
  fetchLatestRelease,
  getDeviceId,
  isInRolloutCohort,
  type ReleaseInfo,
} from "./release-policy";

export const SW_UPDATE_EVENT = "sh:sw-update-available";
/** Fired just before the page reloads so screens can persist draft state. */
export const BEFORE_UPDATE_EVENT = "sh:before-update";

type UpdateFn = (reload?: boolean) => Promise<void>;

let applyFn: UpdateFn | null = null;
let release: ReleaseInfo | null = null;
let cohortChecked = false;
let inCohort = true;
let snoozed = false;
let clubId: string | null = null;

const SNOOZE_KEY = "sh.pwa.updateSnoozed";
const RETURN_KEY = "sh.pwa.updateReturnTo";
const DRAFT_EVENT_KEY = "sh.pwa.updateAt";

try {
  snoozed = sessionStorage.getItem(SNOOZE_KEY) === "1";
} catch {
  // ignore
}

function announce() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT));
}

/** Set by the app once the active club is known (used for club-targeted rollouts). */
export function setUpdateClubContext(id: string | null): void {
  if (clubId === id) return;
  clubId = id;
  cohortChecked = false;
  void evaluateCohort();
}

async function evaluateCohort(): Promise<void> {
  if (cohortChecked) return;
  cohortChecked = true;
  release = await fetchLatestRelease();
  inCohort = isInRolloutCohort(release, getDeviceId(), clubId);
  announce();
}

/** Called by pwa-register when workbox reports a waiting worker. */
export function setUpdateHandler(fn: UpdateFn): void {
  applyFn = fn;
  void evaluateCohort();
  announce();
}

export function hasPendingUpdate(): boolean {
  return applyFn !== null;
}

/** True when the waiting build is a critical (security) release. */
export function isCriticalUpdate(): boolean {
  return !!applyFn && release?.severity === "critical";
}

/** True when this device is inside the rollout cohort for the waiting build. */
export function isUpdateInCohort(): boolean {
  return inCohort;
}

export function isUpdateSnoozed(): boolean {
  return snoozed;
}

/**
 * Should the update pill be shown right now?
 * The caller additionally gates on a "safe moment" having occurred.
 */
export function isUpdateOfferable(): boolean {
  if (!applyFn) return false;
  if (!inCohort) return false;
  if (isCriticalUpdate()) return true;
  if (snoozed) return false;
  return !isBusy();
}

/** "Later": hide for this session only. The waiting worker stays parked. */
export function snoozeUpdate(): void {
  snoozed = true;
  try {
    sessionStorage.setItem(SNOOZE_KEY, "1");
  } catch {
    // ignore
  }
  announce();
}

/** Allow the app to flush in-flight writes before reloading. */
type Flusher = () => Promise<void>;
let flusher: Flusher | null = null;
export function setPendingWriteFlusher(fn: Flusher | null): void {
  flusher = fn;
}

/**
 * Activate the waiting SW and reload — gracefully.
 * Caller must confirm with the user (or it must be a critical release).
 */
export async function applyPendingUpdate(): Promise<void> {
  const fn = applyFn;
  if (!fn) return;
  applyFn = null;

  // 1. Let screens persist any draft/scratch state.
  try {
    window.dispatchEvent(new CustomEvent(BEFORE_UPDATE_EVENT));
    sessionStorage.setItem(DRAFT_EVENT_KEY, String(Date.now()));
  } catch {
    // ignore
  }

  // 2. Let in-flight writes settle (bounded — never hang the UI).
  if (flusher) {
    try {
      await Promise.race([
        flusher(),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
    } catch {
      // ignore
    }
  }

  // 3. Remember where the user was: some installed shells (notably Android)
  // relaunch at start_url after the new worker takes control.
  try {
    const here = window.location.pathname + window.location.search + window.location.hash;
    if (here && here !== "/") sessionStorage.setItem(RETURN_KEY, here);
    sessionStorage.removeItem(SNOOZE_KEY);
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
  snoozeUpdate();
}

/**
 * Manual "check for updates" — used by the version badge.
 * Asks the browser to re-fetch the service worker; if a newer build is already
 * waiting it activates it, otherwise it force-reloads bypassing the HTTP cache.
 * Returns true when an update was applied.
 */
export async function checkForUpdateNow(): Promise<boolean> {
  if (applyFn) {
    await applyPendingUpdate();
    return true;
  }
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update().catch(() => {})));
      // Give workbox a moment to report a waiting worker.
      await new Promise((r) => setTimeout(r, 1200));
      if (applyFn) {
        await applyPendingUpdate();
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

/** Last resort: drop app caches and reload from the network. Never mid-task. */
export async function hardRefresh(): Promise<void> {
  if (isBusy()) {
    throw new Error("BUSY");
  }
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => /precache|runtime|html-pages|workbox/i.test(n))
          .map((n) => caches.delete(n)),
      );
    }
  } catch {
    // ignore
  }
  window.location.reload();
}

/** Test-only reset. */
export function __resetUpdateState(): void {
  applyFn = null;
  release = null;
  cohortChecked = false;
  inCohort = true;
  snoozed = false;
  clubId = null;
}
