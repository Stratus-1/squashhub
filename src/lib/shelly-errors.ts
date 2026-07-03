/**
 * Turn a supabase.functions.invoke() error into a human-readable message.
 *
 * `FunctionsHttpError.message` is always "Edge Function returned a non-2xx
 * status code" — the real reason is in the response body. We pull that out,
 * then map the common Shelly configuration errors to friendly copy so users
 * get actionable text instead of a generic "edge function error".
 */
export async function extractFunctionError(err: any, fallback: string): Promise<string> {
  // Try to read the actual JSON body from FunctionsHttpError first.
  let raw = "";
  try {
    const ctx = err?.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      raw = body?.error || body?.message || JSON.stringify(body);
    } else if (ctx && typeof ctx.text === "function") {
      raw = await ctx.text();
    }
  } catch {
    /* ignore body-parse errors */
  }
  if (!raw) raw = String(err?.message || err || fallback);

  return friendlyShellyMessage(raw, fallback);
}

/**
 * Map common Shelly / access-control failure strings to user-facing copy.
 * Falls back to the raw message so admins still see the real error.
 */
export function friendlyShellyMessage(raw: string, fallback: string): string {
  const s = raw.toLowerCase();

  // === Configuration missing ===
  if (s.includes("shelly auth key not configured")) {
    return "Shelly Cloud isn't connected yet. Ask your admin to paste the Shelly Authorization Cloud Key in Club Admin → Access / Courts.";
  }
  if (s.includes("shelly door device id not configured") || s.includes("shelly door device id")) {
    return "The door relay isn't paired yet. Ask your admin to enter the Shelly 1 Mini Device ID in Club Admin → Access Control.";
  }
  if (s.includes("relay_device_id") || s.includes("device id not configured for court") || s.includes("no relay device")) {
    return "This court's smart relay isn't configured yet. Ask your admin to enter the Shelly Device ID for this court in Club Admin → Courts.";
  }
  if (s.includes("shelly_server") || s.includes("shelly server")) {
    return "Shelly server address is missing or invalid. Ask your admin to check the Shelly Server URI in Court settings.";
  }

  // === Cloud API responses ===
  // IMPORTANT: check Shelly-specific errors BEFORE the generic "permission" bucket.
  if (
    s.includes("no_permissions") ||
    s.includes("do not have permission") ||
    s.includes("do not have permissions to control")
  ) {
    return "Shelly Cloud says this key doesn't own the relay. The Authorization Cloud Key must come from the Shelly account that the device is paired to (or the device must be shared with that account). Ask your admin to check in Shelly Cloud → Settings → Authorization Cloud Key.";
  }
  if (s.includes("device not found") || s.includes("device is not found")) {
    return "Shelly Cloud can't see this relay. Check the device is online in the Shelly app, and that the Device ID matches exactly.";
  }
  if (s.includes("invalid auth_key") || s.includes("unauthorized") || s.includes("invalid token")) {
    return "The Shelly Cloud key is invalid or expired. Ask your admin to regenerate it in Shelly Cloud → Settings → Authorization Cloud Key.";
  }
  if (s.includes("device is offline") || s.includes("offline")) {
    return "The Shelly relay is offline. Check that it has power and WiFi, then try again.";
  }
  if (s.includes("timeout") || s.includes("timed out")) {
    return "The relay didn't respond in time. It may be temporarily offline — try again in a moment.";
  }
  if (s.includes("shelly rejected")) {
    return `Shelly Cloud rejected the request: ${raw.replace(/^shelly rejected:\s*/i, "")}. Check the Device ID and channel in Court settings.`;
  }
  if (/shelly \d{3}/.test(s) || s.includes("shelly on failed") || s.includes("shelly off failed")) {
    return `Shelly Cloud error: ${raw}. Check device ID, channel and Cloud key.`;
  }

  // === Auth / permission ===
  if (s.includes("not authenticated") || s.includes("no session")) {
    return "You've been signed out. Please sign in again and retry.";
  }
  if (s.includes("permission") || s.includes("forbidden") || s.includes("rls")) {
    return "You don't have permission to trigger this device. Ask a club admin.";
  }

  // === Booking / session logic ===
  if (s.includes("no active booking") || s.includes("booking not found")) {
    return "We couldn't match this to an active booking. Refresh and try again.";
  }
  if (s.includes("already on") || s.includes("session already active")) {
    return "Lights are already on for this booking.";
  }

  // === Generic edge-function envelope ===
  if (s.includes("non-2xx status") || s === "failed to fetch" || s === "load failed") {
    return `${fallback}. Please try again — if this persists, ask your admin to check Shelly settings.`;
  }

  return raw || fallback;
}
