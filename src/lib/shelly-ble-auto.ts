/**
 * Runtime BLE picker.
 *
 * - Native (Capacitor iOS/Android) → CoreBluetooth / Android BLE via
 *   `@capacitor-community/bluetooth-le`. This is the ONLY option on iPhone
 *   because Apple never shipped Web Bluetooth to Safari/WKWebView.
 * - Web (Chrome desktop / Chrome-on-Android / Edge) → Web Bluetooth.
 * - Everything else (Safari desktop, Firefox, iOS browsers) → unavailable.
 *
 * Callers should use `pulseShellyBleAuto` and `isBleFallbackAvailable` and
 * never import the underlying web/native modules directly.
 */

import { Capacitor } from "@capacitor/core";
import {
  isWebBluetoothAvailable,
  pulseShellyBle,
  type BlePulseParams,
} from "./shelly-ble";

export type { BlePulseParams } from "./shelly-ble";

export function isBleFallbackAvailable(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  return isWebBluetoothAvailable();
}

export async function pulseShellyBleAuto(params: BlePulseParams): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    // Dynamic import so the Capacitor BLE plugin (and its native bindings)
    // isn't pulled into the web bundle for browser-only users.
    const { pulseShellyBleNative } = await import("./shelly-ble-native");
    return pulseShellyBleNative(params);
  }
  if (!isWebBluetoothAvailable()) {
    throw new Error(
      "Bluetooth fallback isn't available on this device. On iPhone, install the SquashHub app. On desktop, use Chrome or Edge.",
    );
  }
  return pulseShellyBle(params);
}
