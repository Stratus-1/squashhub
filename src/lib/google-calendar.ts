import { Capacitor } from "@capacitor/core";

function fmtUtcForGoogleCalendar(d: Date) {
  // Google Calendar URL expects: YYYYMMDDTHHMMSSZ
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function buildGoogleCalendarEventUrl(args: {
  title: string;
  startLocal: Date;
  endLocal: Date;
  details?: string;
  location?: string;
  guestEmail?: string | null;
}) {
  const params = new URLSearchParams();
  params.set("action", "TEMPLATE");
  params.set("text", args.title);
  params.set("dates", `${fmtUtcForGoogleCalendar(args.startLocal)}/${fmtUtcForGoogleCalendar(args.endLocal)}`);
  if (args.details) params.set("details", args.details);
  if (args.location) params.set("location", args.location);
  if (args.guestEmail) params.set("add", args.guestEmail);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export async function openExternalUrl(url: string) {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

