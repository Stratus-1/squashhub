import { Capacitor } from "@capacitor/core";

const APP_SCHEME = "gbsquash";

export function buildYocoReturnUrl(pathAndSearch: string) {
  if (!Capacitor.isNativePlatform()) {
    return `${window.location.origin}${pathAndSearch}`;
  }

  const nativePath = pathAndSearch.replace(/^\/+/, "");
  return `${APP_SCHEME}://${nativePath}`;
}

export async function openYocoCheckout(url: string) {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }

  window.location.href = url;
}