/**
 * Native (Capacitor / CoreBluetooth on iOS, Android BLE on Android) fallback
 * for Shelly relays. Mirrors the Web Bluetooth flow in `shelly-ble.ts` but
 * runs through `@capacitor-community/bluetooth-le` so it works on iPhone —
 * which has no Web Bluetooth support at all.
 *
 * Only invoked from `triggerShelly*` helpers when `Capacitor.isNativePlatform()`
 * is true and the primary cloud path failed.
 */

import { BleClient, numbersToDataView } from "@capacitor-community/bluetooth-le";
import type { BlePulseParams } from "./shelly-ble";

const SHELLY_RPC_SERVICE = "5f6d4f53-5f52-5043-5f52-4f4f4653435f";
const SHELLY_RPC_DATA = "5f6d4f53-5f52-5043-5f64-6174615f5f5f";
const SHELLY_RPC_TXCTL = "5f6d4f53-5f52-5043-5f74-78637472736c";

function bytesToDv(bytes: Uint8Array): DataView {
  return numbersToDataView(Array.from(bytes));
}

export async function pulseShellyBleNative(params: BlePulseParams): Promise<void> {
  await BleClient.initialize({ androidNeverForLocation: true });

  const tail = params.mac.replace(/[^0-9a-f]/gi, "").slice(-6).toUpperCase();

  // Scan briefly for a Shelly advertising the RPC service; pick the closest
  // match by name tail if available, else the first Shelly seen.
  const device = await BleClient.requestDevice({
    services: [SHELLY_RPC_SERVICE],
    namePrefix: "Shelly",
    optionalServices: [SHELLY_RPC_SERVICE],
  });

  if (tail && device.name && !device.name.toUpperCase().includes(tail)) {
    console.warn(`[shelly-ble-native] connected device ${device.name} does not match tail ${tail}`);
  }

  await BleClient.connect(device.deviceId);
  try {
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
    if (params.password) rpc.auth = { password: params.password };

    const encoded = new TextEncoder().encode(JSON.stringify(rpc));

    // Announce frame length on the TX-CTL characteristic (Shelly RPC framing).
    try {
      const lenBuf = new Uint8Array(4);
      new DataView(lenBuf.buffer).setUint32(0, encoded.byteLength, false);
      await BleClient.write(device.deviceId, SHELLY_RPC_SERVICE, SHELLY_RPC_TXCTL, bytesToDv(lenBuf));
    } catch (e) {
      // Some Gen3 firmwares don't expose TX-CTL; continue with raw writes.
      console.warn("[shelly-ble-native] TX-CTL write failed, continuing", e);
    }

    // Chunk into MTU-friendly writes (default BLE MTU is ~20 bytes).
    const CHUNK = 20;
    for (let i = 0; i < encoded.byteLength; i += CHUNK) {
      const slice = encoded.slice(i, i + CHUNK);
      await BleClient.writeWithoutResponse(
        device.deviceId,
        SHELLY_RPC_SERVICE,
        SHELLY_RPC_DATA,
        bytesToDv(slice),
      );
    }
  } finally {
    try { await BleClient.disconnect(device.deviceId); } catch { /* ignore */ }
  }
}
