import { useEffect, useRef, useState } from "react";

/**
 * GPS geofence helper for door access.
 *
 * A club can pin the door's coordinates + a radius (metres). Members only get
 * the "Open Door" prompt while their phone reports a position inside that
 * circle. Admins bypass this (handled by the caller).
 */

export type DoorGeofence = {
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
};

export type ProximityState =
  | "disabled" // no geofence configured — always allow
  | "locating" // waiting for the first fix
  | "inside"
  | "outside"
  | "denied" // permission refused
  | "unavailable"; // no geolocation support / hard error

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

export function useDoorProximity(fence: DoorGeofence) {
  const active =
    !!fence.enabled && fence.latitude != null && fence.longitude != null;

  const [state, setState] = useState<ProximityState>(
    active ? "locating" : "disabled"
  );
  const [distance, setDistance] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setState("disabled");
      setDistance(null);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unavailable");
      return;
    }

    setState("locating");

    const onPos = (pos: GeolocationPosition) => {
      const d = distanceMeters(
        pos.coords.latitude,
        pos.coords.longitude,
        fence.latitude as number,
        fence.longitude as number
      );
      setDistance(d);
      setAccuracy(pos.coords.accuracy ?? null);
      // Forgive GPS error: treat the reported accuracy as slack, capped at 75 m
      // so a very poor fix can't unlock the door from across town.
      const slack = Math.min(pos.coords.accuracy || 0, 75);
      setState(d <= fence.radiusM + slack ? "inside" : "outside");
    };

    const onErr = (err: GeolocationPositionError) => {
      setState(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
    };

    watchId.current = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 15_000,
      timeout: 20_000,
    });

    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [active, fence.latitude, fence.longitude, fence.radiusM]);

  return {
    active,
    state,
    distance,
    accuracy,
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
