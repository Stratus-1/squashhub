import { Capacitor } from "@capacitor/core";

export async function initDeepLinks() {
  if (!Capacitor.isNativePlatform()) return;

  const { App } = await import("@capacitor/app");
  const { Browser } = await import("@capacitor/browser");

  App.addListener("appUrlOpen", (event) => {
    try {
      const url = new URL(event.url);

      const isHttp = url.protocol === "http:" || url.protocol === "https:";
      const path = isHttp
        ? `${url.pathname}${url.search}${url.hash}`
        : `/${url.host}${url.pathname}${url.search}${url.hash}`;

      // If an external OAuth flow was opened, close it when we get a deep link back.
      void Browser.close();
      window.location.href = path;
    } catch {
      // ignore malformed URLs
    }
  });
}
