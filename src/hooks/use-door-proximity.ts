import { useEffect, useRef, useState } from "react";

/**
 * GPS geofence helper for door access.
 *
 * Two concentric rings:
 *  - the OUTER ring (`radiusM`) simply *arms* access: while inside it the
 *    member gets the "Open Door" button.
 *  - the INNER ring (`triggerRadiusM`, default 5 m — right at the Shelly by
 *    the door) is what auto-unlock uses, so people milling about inside the
 *    outer ring don't pulse the relay.
 *
 * Leaving the outer ring resets the visit, so walking away and coming back
 * arms a fresh auto-unlock.
 */

export type DoorGeofence = {
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  /** Tight ring at the door used for automatic unlock. Defaults to 5 m. */
  triggerRadiusM?: number;
};

export type ProximityState =
  | "disabled" // no geofence configured — always allow
  | "locating" // waiting for the first fix
  | "inside"
  | "outside"
  | "denied" // permission refused
  | "unavailable"; // no geolocation support / hard error

/** Where the member sits relative to the two rings. */
export type ProximityZone = "unknown" | "far" | "near" | "at-door";

export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Median of the recent fixes — kills single-sample GPS spikes. */
function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function useDoorProximity(fence: DoorGeofence) {
  const active =
    !!fence.enabled && fence.latitude != null && fence.longitude != null;
  const triggerRadiusM = Math.max(3, fence.triggerRadiusM ?? 5);

  const [state, setState] = useState<ProximityState>(
    active ? "locating" : "disabled"
  );
  const [zone, setZone] = useState<ProximityZone>("unknown");
  const [distance, setDistance] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const watchId = useRef<number | null>(null);
  const samples = useRef<{ d: number; acc: number; t: number }[]>([]);

  useEffect(() => {
    if (!active) {
      setState("disabled");
      setZone("unknown");
      setDistance(null);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unavailable");
      return;
    }

    setState("locating");
    samples.current = [];

    const onPos = (pos: GeolocationPosition) => {
      const raw = distanceMeters(
        pos.coords.latitude,
        pos.coords.longitude,
        fence.latitude as number,
        fence.longitude as number
      );
      const acc = pos.coords.accuracy ?? 0;

      // Keep a short rolling window (last ~30 s, max 5 fixes) and use the
      // median distance so a single wild fix can't flip state.
      const now = Date.now();
      samples.current = [...samples.current, { d: raw, acc, t: now }]
        .filter((s) => now - s.t < 30_000)
        .slice(-5);
      const d = median(samples.current.map((s) => s.d));

      setDistance(d);
      setAccuracy(acc);

      // Outer ring: forgive GPS error (capped) so the button appears reliably.
      const slack = Math.min(acc, 75);
      const inOuter = d <= fence.radiusM + slack;

      // Inner ring: strict. Only a reasonably accurate fix counts, and the
      // error budget is small so "at the door" really means at the door.
      const trustworthy = acc > 0 && acc <= 30;
      const atDoor =
        trustworthy && d <= triggerRadiusM + Math.min(acc, triggerRadiusM * 2);

      setState(inOuter ? "inside" : "outside");
      setZone(atDoor ? "at-door" : inOuter ? "near" : "far");
    };

    const onErr = (err: GeolocationPositionError) => {
      setState(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      setZone("unknown");
    };

    watchId.current = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 20_000,
    });

    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [active, fence.latitude, fence.longitude, fence.radiusM, triggerRadiusM]);

  return {
    active,
    state,
    zone,
    distance,
    accuracy,
    triggerRadiusM,
    /** At the door — auto-unlock territory. */
    atDoor: zone === "at-door",
    /** Door may be opened from here (or no fence configured). */
    allowed: state === "disabled" || state === "inside",
    /** Human hint for the UI when blocked. */
    hint:
      state === "locating"
        ? "Checking your location…"
        : state === "outside"
        ? distance != null && distance < 100000
          ? `You're about ${formatDistance(distance)} away — move closer to the door`
          : "Move closer to the club to unlock"
        : state === "denied"
        ? "Allow location access to unlock the door"
        : state === "unavailable"
        ? "Location unavailable on this device"
        : "",
  };
}

export function formatDistance(m: number) {
  if (m < 1000) return `${Math.round(m / 5) * 5} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
