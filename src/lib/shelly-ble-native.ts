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
import {
  BLE_EXCHANGE_TIMEOUT_MS,
  BLE_OP_TIMEOUT_MS,
  BLE_SETTLE_MS,
  chunkPayload,
  delay,
  encodeFrameLength,
  pollResponseLength,
  readResponseBody,
  withBleTimeout,
} from "./shelly-ble-transport";


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
      const run = async () => {
        await withBleTimeout(
          () => BleClient.write(
            device.deviceId,
            SHELLY_RPC_SERVICE,
            SHELLY_RPC_TXCTL,
            bytesToDv(encodeFrameLength(encoded.byteLength)),
          ),
          BLE_OP_TIMEOUT_MS,
          "sending frame length",
        );
        await delay(BLE_SETTLE_MS);

        for (const chunk of chunkPayload(encoded)) {
          await withBleTimeout(
            () => BleClient.writeWithoutResponse(
              device.deviceId,
              SHELLY_RPC_SERVICE,
              SHELLY_RPC_DATA,
              bytesToDv(chunk),
            ),
            BLE_OP_TIMEOUT_MS,
            "sending command",
          );
          await delay(5);
        }
        await delay(BLE_SETTLE_MS);

        const responseLength = await pollResponseLength(async () => {
          const value = await withBleTimeout(
            () => BleClient.read(device.deviceId, SHELLY_RPC_SERVICE, SHELLY_RPC_RXCTL),
            BLE_OP_TIMEOUT_MS,
            "reading reply length",
          );
          return dataViewToBytes(value);
        });

        return readResponseBody(responseLength, async () => {
          const value = await withBleTimeout(
            () => BleClient.read(device.deviceId, SHELLY_RPC_SERVICE, SHELLY_RPC_DATA),
            BLE_OP_TIMEOUT_MS,
            "reading reply",
          );
          return dataViewToBytes(value);
        });
      };
      return withBleTimeout(run, BLE_EXCHANGE_TIMEOUT_MS, "waiting for the Shelly to answer");
    };

    await executeShellyRpc(rpc, params.password, exchange);

  } finally {
    try { await BleClient.disconnect(device.deviceId); } catch { /* ignore */ }
  }
}
