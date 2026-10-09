/**
 * Pure description of how this device can open club doors: internet (Shelly
 * Cloud) and Bluetooth fallback. Kept pure so it can be unit-tested.
 */
export type DoorCompatInput = {
  online: boolean;
  native: boolean;
  webBluetooth: boolean;
  ios: boolean;
};

export type DoorCompat = {
  internet: "ok" | "offline";
  bluetooth: "ok" | "unavailable";
  tone: "ok" | "warn" | "error";
  advice: string | null;
};

export function describeDoorCompatibility(i: DoorCompatInput): DoorCompat {
  const bluetooth = i.native || i.webBluetooth ? "ok" : "unavailable";
  const internet = i.online ? "ok" : "offline";
  let advice: string | null = null;
  if (bluetooth === "unavailable") {
    advice = i.ios
      ? "On iPhone, Bluetooth backup only works in the SquashHub app from the App Store. Without it, the door needs an internet connection."
      : "Bluetooth backup isn't supported in this browser. Use Chrome or Edge, or the SquashHub app.";
  }
  if (internet === "offline") {
    advice = bluetooth === "ok"
      ? "You're offline. Stand near the door and tap Open — your phone will use Bluetooth."
      : i.ios
      ? "You're offline and this iPhone can't use Bluetooth here. Reconnect to WiFi or mobile data, or install the SquashHub app."
      : "You're offline and Bluetooth isn't available. Reconnect to WiFi or mobile data.";
  }
  const tone = internet === "ok" ? (bluetooth === "ok" ? "ok" : "warn") : bluetooth === "ok" ? "warn" : "error";
  return { internet, bluetooth, tone, advice };
}

export function detectIos(ua: string, touchMac = false): boolean {
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && touchMac);
}
