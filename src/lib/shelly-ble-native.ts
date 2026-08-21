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
import {
  executeShellyRpc,
  SHELLY_RPC_DATA,
  SHELLY_RPC_RXCTL,
  SHELLY_RPC_SERVICE,
  SHELLY_RPC_TXCTL,
  type ShellyRpcRequest,
} from "./shelly-ble-rpc";

function bytesToDv(bytes: Uint8Array): DataView {
  return numbersToDataView(Array.from(bytes));
}

function dataViewToBytes(value: DataView): Uint8Array {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
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
      await BleClient.write(device.deviceId, SHELLY_RPC_SERVICE, SHELLY_RPC_TXCTL, bytesToDv(lenBuf));

      const CHUNK = 20;
      for (let i = 0; i < encoded.byteLength; i += CHUNK) {
        await BleClient.writeWithoutResponse(
          device.deviceId,
          SHELLY_RPC_SERVICE,
          SHELLY_RPC_DATA,
          bytesToDv(encoded.slice(i, i + CHUNK)),
        );
      }

      const responseLengthValue = await BleClient.read(
        device.deviceId,
        SHELLY_RPC_SERVICE,
        SHELLY_RPC_RXCTL,
      );
      const responseLengthBytes = dataViewToBytes(responseLengthValue);
      if (responseLengthBytes.byteLength < 4) throw new Error("Shelly returned an invalid response length.");
      const responseLength = responseLengthValue.getUint32(0, false);
      if (responseLength < 1 || responseLength > 64 * 1024) {
        throw new Error(`Shelly returned an invalid response length (${responseLength}).`);
      }

      const response = new Uint8Array(responseLength);
      let offset = 0;
      while (offset < responseLength) {
        const value = await BleClient.read(device.deviceId, SHELLY_RPC_SERVICE, SHELLY_RPC_DATA);
        const bytes = dataViewToBytes(value);
        if (!bytes.byteLength) throw new Error("Shelly returned an incomplete Bluetooth response.");
        const remaining = responseLength - offset;
        response.set(bytes.subarray(0, remaining), offset);
        offset += Math.min(bytes.byteLength, remaining);
      }
      return response;
    };

    await executeShellyRpc(rpc, params.password, exchange);
  } finally {
    try { await BleClient.disconnect(device.deviceId); } catch { /* ignore */ }
  }
}
