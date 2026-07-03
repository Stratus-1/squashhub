import { supabase } from "@/integrations/supabase/client";
import { enqueueOutbox, type AccessEventPayload } from "@/lib/outbox";
import { pulseShellyBleAuto, isBleFallbackAvailable } from "@/lib/shelly-ble-auto";
import { extractFunctionError } from "@/lib/shelly-errors";

export type ShellyLightsOptions = {
  clubId: string;
  bookingId: string;
  courtId: number;
  courtName?: string;
  clubMemberId?: string | null;
  /** Per-court BLE MAC (from courts.relay_ble_mac). */
  courtRelayBleMac?: string | null;
  /** Club-wide BLE fallback settings from club_secrets. */
  ble?: {
    enabled: boolean;
    password?: string | null;
    channel?: number | null;
    pulseMs?: number | null;
  } | null;
};

export type ShellyLightsResult = {
  ok: boolean;
  via: "cloud" | "ble_fallback";
  message: string;
};

function isNetworkError(err: any) {
  const msg = String(err?.message || err || "");
  return (
    !navigator.onLine ||
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("Load failed") ||
    msg.includes("Network request failed") ||
    msg.includes("fetch failed")
  );
}

function queueAccessEvent(
  opts: ShellyLightsOptions,
  eventType: string,
  raw: Record<string, unknown>,
) {
  return (async () => {
    const userId = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!userId) return;
    const payload: AccessEventPayload = {
      event: {
        club_id: opts.clubId,
        club_member_id: opts.clubMemberId ?? null,
        door_name: `${opts.courtName || `Court ${opts.courtId}`} lights`,
        event_type: eventType,
        occurred_at: new Date().toISOString(),
        raw: { ...raw, booking_id: opts.bookingId, court_id: opts.courtId },
      },
    };
    enqueueOutbox({
      id: crypto.randomUUID(),
      kind: "access_event",
      user_id: userId,
      created_at: new Date().toISOString(),
      payload,
    });
  })();
}

/**
 * Turn on court lights via SquashHub → Shelly Cloud (primary). On network
 * failure, fall back to Web-Bluetooth pulse against the per-court Shelly relay
 * and queue an access_event so the light session is reconciled (and billed)
 * once we're back online.
 */
export async function triggerShellyLights(opts: ShellyLightsOptions): Promise<ShellyLightsResult> {
  // 1) Primary: cloud
  try {
    const { data, error } = await supabase.functions.invoke("court-lights", {
      body: { action: "turn_on", booking_id: opts.bookingId },
    });
    if (error) throw error;
    return {
      ok: true,
      via: "cloud",
      message: `Lights on! ⚡${data?.fee_charged ? ` R${Number(data.fee_charged).toFixed(2)}` : ""}`,
    };
  } catch (cloudErr: any) {
    if (!isNetworkError(cloudErr)) {
      const msg = await extractFunctionError(cloudErr, "Failed to turn on lights");
      throw new Error(msg);
    }

    // 2) BLE fallback (per-court MAC + club-wide password)
    const ble = opts.ble;
    if (!ble?.enabled || !opts.courtRelayBleMac) {
      await queueAccessEvent(opts, "shelly_lights_cloud_offline", {
        error: String(cloudErr?.message || cloudErr),
      });
      throw new Error(
        "You're offline and Bluetooth fallback isn't configured for this court. Ask your admin to add a BLE MAC in Court settings.",
      );
    }
    if (!isWebBluetoothAvailable()) {
      throw new Error(
        "You're offline. This browser can't use Bluetooth fallback — open in the SquashHub app or Chrome on Android to turn lights on locally.",
      );
    }

    let bleErr: any = null;
    try {
      await pulseShellyBle({
        mac: opts.courtRelayBleMac,
        password: ble.password ?? undefined,
        channel: ble.channel ?? 0,
        pulseMs: ble.pulseMs ?? 3600_000, // full hour by default for lights
        turn: "on",
      });
    } catch (e) {
      bleErr = e;
    }

    await queueAccessEvent(
      opts,
      bleErr ? "shelly_lights_ble_fallback_failed" : "shelly_lights_ble_fallback",
      { ble_mac: opts.courtRelayBleMac, error: bleErr ? String(bleErr?.message || bleErr) : null },
    );

    if (bleErr) throw bleErr;
    return {
      ok: true,
      via: "ble_fallback",
      message: "Lights on via Bluetooth (offline). Billing will reconcile when you're back online.",
    };
  }
}
