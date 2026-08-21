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
 *   Tx-CTL          5f6d4f53-5f52-5043-5f74-785f63746c5f
 *   Rx-CTL          5f6d4f53-5f52-5043-5f72-785f63746c5f
 *
 * A `Switch.Set` RPC uses `toggle_after` so the relay auto-releases (door
 * strike / lights kill-switch). The response is required: a completed GATT
 * write is not proof that the relay accepted the command.
 */

import {
  executeShellyRpc,
  SHELLY_RPC_DATA,
  SHELLY_RPC_RXCTL,
  SHELLY_RPC_SERVICE,
  SHELLY_RPC_TXCTL,
  type ShellyRpcRequest,
} from "./shelly-ble-rpc";

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
 * Web Bluetooth is blocked inside cross-origin iframes unless the parent sets
 * `allow="bluetooth"`. The Lovable preview iframe does not, so requestDevice
 * either throws SecurityError or shows an empty chooser. Detect it so we can
 * tell the admin to open the app in its own tab instead of chasing hardware.
 */
export function isInBlockedIframe() {
  if (typeof window === "undefined") return false;
  try {
    if (window.self === window.top) return false;
  } catch {
    return true; // cross-origin access threw → we're framed
  }
  const fp: any = (document as any).featurePolicy || (document as any).permissionsPolicy;
  try {
    if (fp?.allowsFeature) return !fp.allowsFeature("bluetooth");
  } catch { /* ignore */ }
  return true;
}

export function describeBleError(err: any): string {
  const name = err?.name || "";
  const msg = String(err?.message || err || "");
  if (name === "NotFoundError" && /cancelled|chooser/i.test(msg)) {
    return "No device was picked. If the chooser was empty: the Shelly must be powered, within ~5 m, and have Bluetooth enabled in the Shelly app (Settings → Bluetooth). Note a Shelly only advertises BLE when it is not already connected to another phone.";
  }
  if (name === "NotFoundError") {
    return "No Shelly found over Bluetooth. Enable Bluetooth on the Shelly (Shelly app → Settings → Bluetooth), stand within ~5 m, and make sure no other phone is connected to it.";
  }
  if (name === "SecurityError") {
    return "Bluetooth is blocked here. Open SquashHub in its own browser tab (not inside the preview frame) over HTTPS, or use the installed app.";
  }
  if (name === "NotAllowedError") {
    return "Bluetooth permission was denied for this site. Allow Bluetooth in the browser/OS settings and try again.";
  }
  return msg || "Bluetooth pulse failed";
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
  if (isInBlockedIframe()) {
    throw new Error(
      "Bluetooth can't be used inside the preview frame. Open SquashHub in its own browser tab (or the installed app) and test again.",
    );
  }

  const bluetooth = (navigator as any).bluetooth as {
    requestDevice: (opts: any) => Promise<any>;
  };

  // Shelly BLE ads name themselves like "ShellyPlus1-<macTail>".
  const tail = params.mac.replace(/[^0-9a-f]/gi, "").slice(-6).toUpperCase();
  let device: any;
  try {
    device = await bluetooth.requestDevice({
      filters: [{ namePrefix: "Shelly" }, { namePrefix: "shelly" }],
      optionalServices: [SHELLY_RPC_SERVICE],
    });
  } catch (err: any) {
    if (err?.name === "NotFoundError") {
      // Chooser was empty or cancelled — retry showing every nearby device so
      // the admin can pick a Shelly that advertises under a custom name.
      try {
        device = await bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [SHELLY_RPC_SERVICE],
        });
      } catch (err2: any) {
        throw new Error(describeBleError(err2));
      }
    } else {
      throw new Error(describeBleError(err));
    }
  }


  // Best-effort name check — user may pick another Shelly by mistake.
  if (tail && device.name && !device.name.toUpperCase().includes(tail)) {
    // Not a hard failure — some Gen3 devices don't include the tail in name.
    console.warn(`[shelly-ble] connected device ${device.name} does not match tail ${tail}`);
  }

  const server = await device.gatt.connect();
  try {
    const service = await server.getPrimaryService(SHELLY_RPC_SERVICE);
    const dataChar = await service.getCharacteristic(SHELLY_RPC_DATA);
    const txCtl = await service.getCharacteristic(SHELLY_RPC_TXCTL);
    const rxCtl = await service.getCharacteristic(SHELLY_RPC_RXCTL);

    const rpc: ShellyRpcRequest = {
      id: 1,
      src: "squashhub",
      method: "Switch.Set",
      params: {
        id: params.channel ?? 0,
        on: (params.turn ?? "on") === "on",
        toggle_after: Math.max(1, Math.round((params.pulseMs ?? 3000) / 1000)),
      },
    };
    const exchange = async (encoded: Uint8Array): Promise<Uint8Array> => {
      const lenBuf = new Uint8Array(4);
      new DataView(lenBuf.buffer).setUint32(0, encoded.byteLength, false);
      await txCtl.writeValue(lenBuf);

      const CHUNK = 20;
      for (let i = 0; i < encoded.byteLength; i += CHUNK) {
        await dataChar.writeValue(encoded.slice(i, i + CHUNK));
      }

      const responseLengthValue = await rxCtl.readValue();
      if (responseLengthValue.byteLength < 4) throw new Error("Shelly returned an invalid response length.");
      const responseLength = responseLengthValue.getUint32(0, false);
      if (responseLength < 1 || responseLength > 64 * 1024) {
        throw new Error(`Shelly returned an invalid response length (${responseLength}).`);
      }

      const response = new Uint8Array(responseLength);
      let offset = 0;
      while (offset < responseLength) {
        const chunk = await dataChar.readValue();
        const bytes = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        if (!bytes.byteLength) throw new Error("Shelly returned an incomplete Bluetooth response.");
        const remaining = responseLength - offset;
        response.set(bytes.subarray(0, remaining), offset);
        offset += Math.min(bytes.byteLength, remaining);
      }
      return response;
    };

    await executeShellyRpc(rpc, params.password, exchange);
  } finally {
    try { server.disconnect(); } catch { /* ignore */ }
  }
}
