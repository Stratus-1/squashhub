// Global "user is busy" registry.
//
// The safe-silent-update system uses this to decide whether it is polite to
// surface an update. While any activity is registered we:
//   • never surface the update pill,
//   • never let the SW poller activate a new worker,
//   • never allow a hard refresh,
//   • guard accidental unloads (for kinds that carry unsaved work).
//
// State is module-local (not React state) so non-React code (pwa-register)
// can read it cheaply.

export type ActivityKind =
  | "scoring"
  | "form"
  | "upload"
  | "payment"
  | "mutation"
  | "wizard";

/** Kinds that represent unsaved / in-flight work worth a browser unload prompt. */
const UNLOAD_GUARDED: ActivityKind[] = ["scoring", "form", "upload", "payment"];

const counts = new Map<ActivityKind, number>();
const listeners = new Set<(busy: boolean) => void>();

let unloadGuardAttached = false;

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = "You have work in progress. Leave anyway?";
  return e.returnValue;
}

function countOf(kind: ActivityKind): number {
  return counts.get(kind) ?? 0;
}

function total(): number {
  let n = 0;
  counts.forEach((v) => (n += v));
  return n;
}

function needsUnloadGuard(): boolean {
  return UNLOAD_GUARDED.some((k) => countOf(k) > 0);
}

function syncUnloadGuard() {
  if (typeof window === "undefined") return;
  const want = needsUnloadGuard();
  if (want && !unloadGuardAttached) {
    window.addEventListener("beforeunload", onBeforeUnload);
    unloadGuardAttached = true;
  } else if (!want && unloadGuardAttached) {
    window.removeEventListener("beforeunload", onBeforeUnload);
    unloadGuardAttached = false;
  }
}

function emit() {
  const busy = isBusy();
  listeners.forEach((fn) => {
    try {
      fn(busy);
    } catch {
      // ignore listener errors
    }
  });
}

/**
 * Register an activity. Returns an idempotent "end" function.
 *
 *   const end = beginActivity("form");
 *   ... later ...
 *   end();
 */
export function beginActivity(kind: ActivityKind): () => void {
  counts.set(kind, countOf(kind) + 1);
  syncUnloadGuard();
  emit();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    counts.set(kind, Math.max(0, countOf(kind) - 1));
    syncUnloadGuard();
    emit();
  };
}

/**
 * True while a modal / dialog / sheet is open (Radix marks these in the DOM).
 * Dialogs (or ancestors) marked with `data-activity-exempt` are navigation
 * chrome rather than unsaved work — e.g. the mobile sidebar sheet that hosts
 * the "check for updates" badge — and do not count.
 */
export function isDialogOpen(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const open = document.querySelectorAll(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    );
    for (const el of Array.from(open)) {
      if (!(el as HTMLElement).closest("[data-activity-exempt]")) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** True when the user is mid-task and must not be interrupted. */
export function isBusy(): boolean {
  return total() > 0 || isDialogOpen();
}

/** Snapshot of the registered activity kinds (debugging / diagnostics). */
export function activitySnapshot(): Record<string, number> {
  const out: Record<string, number> = {};
  counts.forEach((v, k) => {
    if (v > 0) out[k] = v;
  });
  if (isDialogOpen()) out.dialog = 1;
  return out;
}

/** Subscribe to busy-state changes. Returns an unsubscribe function. */
export function subscribeActivity(fn: (busy: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Test-only reset. */
export function __resetActivity(): void {
  counts.clear();
  syncUnloadGuard();
  emit();
}
