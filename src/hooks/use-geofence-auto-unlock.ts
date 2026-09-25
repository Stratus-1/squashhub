import { useEffect, useRef } from "react";
import { useDoorProximity, type DoorGeofence } from "@/hooks/use-door-proximity";
import {
  loadAutoUnlockState,
  saveAutoUnlockState,
  stepAutoUnlock,
} from "@/lib/geofence-auto-unlock";

/**
 * Watches the member's position against one door's geofence and calls
 * `onEnter` exactly once per genuine arrival. Never hides or disables the
 * manual control — it only adds the automatic path.
 */
export function useGeofenceAutoUnlock(opts: {
  /** Stable id per door (used to persist fired/armed state across reloads). */
  id: string;
  fence: DoorGeofence;
  /** Auto-unlock switched on AND this member may open the door. */
  enabled: boolean;
  /** Keep watching location even when auto-unlock is off (e.g. near-only button). */
  watch?: boolean;
  onEnter: () => void | Promise<void>;
}) {
  const proximity = useDoorProximity({
    ...opts.fence,
    enabled: opts.fence.enabled && (opts.enabled || !!opts.watch),
  });
  const fire = useRef(opts.onEnter);
  fire.current = opts.onEnter;

  useEffect(() => {
    if (!opts.enabled || !proximity.active) return;
    if (proximity.distance == null || proximity.accuracy == null) return;
    const prev = loadAutoUnlockState(opts.id);
    const { state, fire: shouldFire } = stepAutoUnlock(
      prev,
      { distanceM: proximity.distance, accuracyM: proximity.accuracy, now: Date.now() },
      opts.fence.radiusM,
    );
    saveAutoUnlockState(opts.id, state);
    if (shouldFire) void fire.current();
  }, [opts.enabled, opts.id, opts.fence.radiusM, proximity.active, proximity.distance, proximity.accuracy]);

  return proximity;
}
