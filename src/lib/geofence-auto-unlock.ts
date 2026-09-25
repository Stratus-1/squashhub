/**
 * Geofence auto-unlock state machine (pure, testable).
 *
 * Rules:
 *  - Fires ONCE when the member enters the configured radius.
 *  - Staying inside never fires again.
 *  - Re-arms only after a genuine exit: the member must be clearly beyond the
 *    radius plus a buffer (hysteresis) for a sustained period, so GPS jitter
 *    around the boundary cannot re-trigger the door.
 *  - Inaccurate fixes are ignored for entry decisions.
 */

export interface AutoUnlockState {
  /** True once auto-unlock fired for the current visit. */
  fired: boolean;
  firedAt: number | null;
  /** When the member was first seen clearly outside the exit buffer. */
  outsideSince: number | null;
}

export const INITIAL_AUTO_UNLOCK_STATE: AutoUnlockState = {
  fired: false,
  firedAt: null,
  outsideSince: null,
};

/** Must be clearly outside this long before auto-unlock re-arms. */
export const EXIT_CONFIRM_MS = 45_000;
/** A fired record older than this is treated as a new visit (missed exit). */
export const FIRED_EXPIRY_MS = 12 * 60 * 60 * 1000;

/** Extra distance beyond the radius that counts as a genuine exit. */
export function exitBuffer(radiusM: number) {
  return Math.max(25, radiusM * 0.3);
}

/** Worst GPS accuracy we trust for an entry decision. */
export function maxEntryAccuracy(radiusM: number) {
  return Math.max(40, Math.min(radiusM, 100));
}

export function stepAutoUnlock(
  prev: AutoUnlockState,
  sample: { distanceM: number; accuracyM: number; now: number },
  radiusM: number,
): { state: AutoUnlockState; fire: boolean } {
  const { distanceM, accuracyM, now } = sample;
  let state = prev;

  if (state.fired && state.firedAt != null && now - state.firedAt > FIRED_EXPIRY_MS) {
    state = { ...INITIAL_AUTO_UNLOCK_STATE };
  }

  const inside =
    accuracyM > 0 &&
    accuracyM <= maxEntryAccuracy(radiusM) &&
    distanceM <= radiusM + Math.min(accuracyM, radiusM * 0.5);
  const clearlyOutside = distanceM > radiusM + exitBuffer(radiusM);

  if (state.fired) {
    if (clearlyOutside) {
      const since = state.outsideSince ?? now;
      if (now - since >= EXIT_CONFIRM_MS) {
        return { state: { ...INITIAL_AUTO_UNLOCK_STATE }, fire: false };
      }
      return { state: { ...state, outsideSince: since }, fire: false };
    }
    // Back near/inside before the exit was confirmed: jitter, stay fired.
    return { state: state.outsideSince ? { ...state, outsideSince: null } : state, fire: false };
  }

  if (inside) {
    return { state: { fired: true, firedAt: now, outsideSince: null }, fire: true };
  }
  return { state, fire: false };
}

const key = (id: string) => `geofence_auto_unlock_${id}`;

export function loadAutoUnlockState(id: string): AutoUnlockState {
  try {
    const raw = localStorage.getItem(key(id));
    if (!raw) return { ...INITIAL_AUTO_UNLOCK_STATE };
    const p = JSON.parse(raw);
    return {
      fired: !!p.fired,
      firedAt: typeof p.firedAt === "number" ? p.firedAt : null,
      outsideSince: typeof p.outsideSince === "number" ? p.outsideSince : null,
    };
  } catch {
    return { ...INITIAL_AUTO_UNLOCK_STATE };
  }
}

export function saveAutoUnlockState(id: string, s: AutoUnlockState) {
  try {
    localStorage.setItem(key(id), JSON.stringify(s));
  } catch {
    // ignore
  }
}

/** Clamp a seconds value from a form into the supported 1–120 s range. */
export function clampUnlockSeconds(v: unknown, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(120, Math.max(1, Math.round(n)));
}
