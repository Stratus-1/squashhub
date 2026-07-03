/**
 * Direct-Bluetooth fallback for Shelly relays.
 *
 * Used only when the primary cloud path (SquashHub → Shelly Cloud API) fails
 * because the phone or router is offline. The pulse is sent over the phone's
 * Web Bluetooth stack directly to the Shelly's local GATT service; the
 * corresponding access/light event is then queued in the offline outbox so it
 * still gets attributed to the member once connectivity returns.
 *
 * Shelly Gen2/Gen3 devices expose an RPC-over-BLE characteristic:
 *   Service         5f6d4f53-5f52-5043-5f52-4f4f4653435f  ("ShellyRPC")
 *   Data (write)    5f6d4f53-5f52-5043-5f64-6174615f5f5f
 *   Data (notify)   5f6d4f53-5f52-5043-5f64-6174615f5f5f  (same char)
 *   Tx-CTL          5f6d4f53-5f52-5043-5f74-78637472736c
 *   Rx-CTL          5f6d4f53-5f52-5043-5f72-78637472736c
 *
 * We only need to fire-and-forget a `Switch.Set` RPC with a `toggle_after` so
 * the relay auto-releases (door strike / lights kill-switch). We do NOT wait
 * for a full notify roundtrip — the goal is a best-effort local pulse.
 */

const SHELLY_RPC_SERVICE = "5f6d4f53-5f52-5043-5f52-4f4f4653435f";
const SHELLY_RPC_DATA = "5f6d4f53-5f52-5043-5f64-6174615f5f5f";
const SHELLY_RPC_TXCTL = "5f6d4f53-5f52-5043-5f74-78637472736c";

export type BlePulseParams = {
  /** Advertised MAC (or last 6 hex) — used as a name filter. */
  mac: string;
  /** BLE control password if the device requires one (Shelly RPC auth). */
  password?: string | null;
  channel?: number;
  pulseMs?: number;
  /** "on" (default) or "off" for lights-off scenarios. */
  turn?: "on" | "off";
};

export function isWebBluetoothAvailable() {
  return typeof navigator !== "undefined"
    && typeof (navigator as any).bluetooth?.requestDevice === "function";
}

/**
 * Best-effort direct BLE pulse.
 *
 * Throws with a friendly message if the browser doesn't support Web
 * Bluetooth or the user cancels the device chooser. Callers should catch
 * and surface a toast; the outbox entry is written separately so we still
 * record the intent even if the BLE pulse itself fails.
 */
export async function pulseShellyBle(params: BlePulseParams): Promise<void> {
  if (!isWebBluetoothAvailable()) {
    throw new Error(
      "This device can't use Bluetooth fallback (Web Bluetooth not supported). Try Chrome on Android or the SquashHub app.",
    );
  }

  const bluetooth = (navigator as any).bluetooth as {
    requestDevice: (opts: any) => Promise<any>;
  };

  // Shelly BLE ads name themselves like "ShellyPlus1-<macTail>".
  const tail = params.mac.replace(/[^0-9a-f]/gi, "").slice(-6).toUpperCase();
  const device = await bluetooth.requestDevice({
    filters: [{ namePrefix: `Shelly` }],
    optionalServices: [SHELLY_RPC_SERVICE],
  });

  // Best-effort name check — user may pick another Shelly by mistake.
  if (tail && device.name && !device.name.toUpperCase().includes(tail)) {
    // Not a hard failure — some Gen3 devices don't include the tail in name.
    console.warn(`[shelly-ble] connected device ${device.name} does not match tail ${tail}`);
  }

  const server = await device.gatt.connect();
  try {
    const service = await server.getPrimaryService(SHELLY_RPC_SERVICE);
    const dataChar = await service.getCharacteristic(SHELLY_RPC_DATA);
    const txCtl = await service.getCharacteristic(SHELLY_RPC_TXCTL).catch(() => null);

    const rpc: Record<string, unknown> = {
      id: 1,
      src: "squashhub",
      method: "Switch.Set",
      params: {
        id: params.channel ?? 0,
        on: (params.turn ?? "on") === "on",
        toggle_after: Math.max(1, Math.round((params.pulseMs ?? 3000) / 1000)),
      },
    };
    if (params.password) {
      rpc.auth = { password: params.password };
    }

    const encoded = new TextEncoder().encode(JSON.stringify(rpc));

    if (txCtl) {
      // Announce frame length on the TX-CTL characteristic (Shelly RPC framing).
      const lenBuf = new Uint8Array(4);
      new DataView(lenBuf.buffer).setUint32(0, encoded.byteLength, false);
      await txCtl.writeValue(lenBuf);
    }

    // Chunk into MTU-friendly writes (default MTU is ~20 bytes).
    const CHUNK = 20;
    for (let i = 0; i < encoded.byteLength; i += CHUNK) {
      await dataChar.writeValue(encoded.slice(i, i + CHUNK));
    }
  } finally {
    try { server.disconnect(); } catch { /* ignore */ }
  }
}
