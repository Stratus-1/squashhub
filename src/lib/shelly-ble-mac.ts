/**
 * Bluetooth address helpers.
 *
 * Shelly relays are stored with both a cloud device id (`dcb4d9ceaa04`) and a
 * BLE MAC (`DC:B4:D9:CE:AA:04`). Admins type the MAC by hand, so a dropped
 * leading zero ("DC:B4:D9:CE:AA:6") used to be saved as-is and silently broke
 * the Bluetooth fallback: the advertised-name tail no longer matched.
 */

/** 12 hex digits, or null when the input can't be a MAC. */
export function bleMacDigits(input?: string | null): string | null {
  const hex = String(input ?? "").replace(/[^0-9a-f]/gi, "").toUpperCase();
  return hex.length === 12 ? hex : null;
}

/** Normalise to `AA:BB:CC:DD:EE:FF`, repairing single-digit octets. */
export function normalizeBleMac(input?: string | null): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  const direct = bleMacDigits(raw);
  if (direct) return direct.match(/.{2}/g)!.join(":");

  // Colon/dash separated but with short octets, e.g. "DC:B4:D9:CE:AA:6".
  const parts = raw.split(/[:\-.\s]+/).filter(Boolean);
  if (parts.length === 6 && parts.every((p) => /^[0-9a-f]{1,2}$/i.test(p))) {
    return parts.map((p) => p.toUpperCase().padStart(2, "0")).join(":");
  }
  return null;
}

/**
 * Best BLE MAC for a relay: the stored MAC when it is valid, otherwise derived
 * from the Shelly cloud device id (they are the same address).
 */
export function resolveBleMac(
  mac?: string | null,
  shellyDeviceId?: string | null,
): string | null {
  return normalizeBleMac(mac) ?? normalizeBleMac(shellyDeviceId);
}
