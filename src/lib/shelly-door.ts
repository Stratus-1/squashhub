import { supabase } from "@/integrations/supabase/client";
import { enqueueOutbox, type AccessEventPayload } from "@/lib/outbox";
import { pulseShellyBle, isWebBluetoothAvailable } from "@/lib/shelly-ble";

export type ShellyDoorOptions = {
  clubId: string;
  doorName?: string;
  /** BLE fallback settings from club_secrets (already fetched client-side). */
  ble?: {
    enabled: boolean;
    mac?: string | null;
    password?: string | null;
    channel?: number | null;
    pulseMs?: number | null;
  } | null;
  /** Club member id for offline attribution. */
  clubMemberId?: string | null;
};

export type ShellyDoorResult = {
  ok: boolean;
  via: "cloud" | "ble_fallback" | "queued_only";
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

function makeAccessEvent(
  opts: ShellyDoorOptions,
  eventType: string,
  raw: Record<string, unknown>,
): AccessEventPayload {
  return {
    event: {
      club_id: opts.clubId,
      club_member_id: opts.clubMemberId ?? null,
      door_name: opts.doorName ?? "Main door",
      event_type: eventType,
      occurred_at: new Date().toISOString(),
      raw,
    },
  };
}

/**
 * Try to open the door via SquashHub → Shelly Cloud (primary path). On a
 * network failure, fall back to a direct Web-Bluetooth pulse and queue the
 * access event in the outbox so it gets attributed to the member once we're
 * back online.
 */
export async function triggerShellyDoor(opts: ShellyDoorOptions): Promise<ShellyDoorResult> {
  // 1) Primary: cloud
  try {
    const { error } = await supabase.functions.invoke("shelly-door-trigger", {
      body: { club_id: opts.clubId, door_name: opts.doorName ?? "Main door" },
    });
    if (error) throw error;
    return { ok: true, via: "cloud", message: "Door pulsed via Shelly Cloud" };
  } catch (cloudErr: any) {
    if (!isNetworkError(cloudErr)) {
      // Not a network problem — surface the real reason from the function body.
      const msg = await extractFunctionError(cloudErr, "Failed to open door");
      throw new Error(msg);
    }

    // 2) Fallback: BLE (only if admin enabled it and a MAC is configured).
    const ble = opts.ble;
    if (!ble?.enabled || !ble.mac) {
      // Queue an "attempted while offline" event so it shows in the audit trail.
      const userId = (await supabase.auth.getSession()).data.session?.user?.id;
      if (userId) {
        enqueueOutbox({
          id: crypto.randomUUID(),
          kind: "access_event",
          user_id: userId,
          created_at: new Date().toISOString(),
          payload: makeAccessEvent(opts, "shelly_cloud_offline", { error: String(cloudErr?.message || cloudErr) }),
        });
      }
      throw new Error(
        "You're offline and Bluetooth fallback isn't configured. Ask your admin to enable BLE fallback in Access settings.",
      );
    }

    if (!isWebBluetoothAvailable()) {
      throw new Error(
        "You're offline. This browser can't use Bluetooth fallback — install SquashHub or open in Chrome on Android to trigger the door locally.",
      );
    }

    let bleErr: any = null;
    try {
      await pulseShellyBle({
        mac: ble.mac,
        password: ble.password ?? undefined,
        channel: ble.channel ?? 0,
        pulseMs: ble.pulseMs ?? 3000,
        turn: "on",
      });
    } catch (e) {
      bleErr = e;
    }

    // 3) Queue an access_event either way — audit trail is the source of truth.
    const userId = (await supabase.auth.getSession()).data.session?.user?.id;
    if (userId) {
      enqueueOutbox({
        id: crypto.randomUUID(),
        kind: "access_event",
        user_id: userId,
        created_at: new Date().toISOString(),
        payload: makeAccessEvent(
          opts,
          bleErr ? "shelly_ble_fallback_failed" : "shelly_ble_fallback",
          { ble_mac: ble.mac, error: bleErr ? String(bleErr?.message || bleErr) : null },
        ),
      });
    }

    if (bleErr) throw bleErr;
    return {
      ok: true,
      via: "ble_fallback",
      message: "Door pulsed via Bluetooth (offline). Event will sync when you're back online.",
    };
  }
}
