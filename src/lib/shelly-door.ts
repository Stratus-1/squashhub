import { supabase } from "@/integrations/supabase/client";
import { enqueueOutbox, type AccessEventPayload } from "@/lib/outbox";
import { pulseShellyBleAuto, isBleFallbackAvailable } from "@/lib/shelly-ble-auto";
import { resolveBleMac } from "@/lib/shelly-ble-mac";
import { extractFunctionError } from "@/lib/shelly-errors";

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
  /** "geofence" = automatic unlock on arrival (uses the auto-unlock duration). */
  trigger?: "manual" | "geofence";
  /** Unlock duration for the Bluetooth fallback when it differs from the manual one. */
  bleDurationMs?: number | null;
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
      body: { club_id: opts.clubId, door_name: opts.doorName ?? "Main door", trigger: opts.trigger ?? "manual" },
    });
    if (error) throw error;
    return { ok: true, via: "cloud", message: "Door pulsed via Shelly Cloud" };
  } catch (cloudErr: any) {
    const cloudMessage = isNetworkError(cloudErr)
      ? "Shelly Cloud is unreachable"
      : await extractFunctionError(cloudErr, "Failed to open door");

    // 2) Fallback: BLE whenever the Cloud path cannot confirm actuation (not
    // only when this phone is offline). This covers an offline Shelly Cloud
    // connection and commands acknowledged by Cloud but not executed.
    const ble = opts.ble ? { ...opts.ble, mac: resolveBleMac(opts.ble.mac) } : null;
    if (!ble?.enabled || !ble.mac) {
      // Queue an "attempted while offline" event so it shows in the audit trail.
      const userId = (await supabase.auth.getSession()).data.session?.user?.id;
      if (userId) {
        enqueueOutbox({
          id: crypto.randomUUID(),
          kind: "access_event",
          user_id: userId,
          created_at: new Date().toISOString(),
          payload: makeAccessEvent(opts, "shelly_cloud_failed", { error: cloudMessage }),
        });
      }
      throw new Error(cloudMessage);
    }

    if (!isBleFallbackAvailable()) {
      throw new Error(
        `${cloudMessage} Bluetooth fallback isn't available on this device — use the installed SquashHub app or Chrome/Edge on a Bluetooth-capable device.`,
      );
    }

    let bleErr: any = null;
    try {
      await pulseShellyBleAuto({
        mac: ble.mac,
        password: ble.password ?? undefined,
        channel: ble.channel ?? 0,
        pulseMs: opts.bleDurationMs ?? ble.pulseMs ?? 3000,
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
          {
            ble_mac: ble.mac,
            cloud_error: cloudMessage,
            error: bleErr ? String(bleErr?.message || bleErr) : null,
          },
        ),
      });
    }

    if (bleErr) throw bleErr;
    return {
      ok: true,
      via: "ble_fallback",
      message: "Shelly Cloud could not confirm the relay, so the door was pulsed via Bluetooth.",
    };
  }
}

/**
 * Bluetooth fallback for a registered access device (the Access rows in Club
 * Controls). The cloud call is made by the caller through `device-control`;
 * this is what runs when that call reports the relay offline, so a member at
 * the door still gets in.
 */
export async function pulseAccessDeviceBle(opts: {
  clubId: string;
  doorName: string;
  clubMemberId?: string | null;
  mac?: string | null;
  shellyDeviceId?: string | null;
  password?: string | null;
  channel?: number | null;
  pulseMs?: number | null;
  cloudError: string;
}): Promise<void> {
  const mac = resolveBleMac(opts.mac, opts.shellyDeviceId);
  if (!mac) throw new Error(opts.cloudError);
  if (!isBleFallbackAvailable()) {
    throw new Error(
      `${opts.cloudError} Bluetooth fallback isn't available on this device — use the installed SquashHub app or Chrome/Edge on a Bluetooth-capable device.`,
    );
  }

  let bleErr: any = null;
  try {
    await pulseShellyBleAuto({
      mac,
      password: opts.password ?? undefined,
      channel: opts.channel ?? 0,
      pulseMs: opts.pulseMs ?? 3000,
      turn: "on",
    });
  } catch (e) {
    bleErr = e;
  }

  const userId = (await supabase.auth.getSession()).data.session?.user?.id;
  if (userId) {
    enqueueOutbox({
      id: crypto.randomUUID(),
      kind: "access_event",
      user_id: userId,
      created_at: new Date().toISOString(),
      payload: makeAccessEvent(
        { clubId: opts.clubId, doorName: opts.doorName, clubMemberId: opts.clubMemberId },
        bleErr ? "shelly_ble_fallback_failed" : "shelly_ble_fallback",
        {
          ble_mac: mac,
          cloud_error: opts.cloudError,
          error: bleErr ? String(bleErr?.message || bleErr) : null,
        },
      ),
    });
  }

  if (bleErr) throw bleErr;
}
