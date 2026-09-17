/**
 * Court-booking confirmations and reminders.
 *
 * A club sets the defaults (which channels, how many hours before) under
 * Courts → Booking rules. Each member may override them for their own booking
 * in the booking dialog; the choice is stored on the booking row so the daily
 * reminder job knows exactly what to send and when.
 */
import { supabase } from "@/integrations/supabase/client";
import { sendSms } from "@/lib/sms-send";
import { sendWhatsApp } from "@/lib/whatsapp-send";

export type BookingChannel = "inapp" | "email" | "sms" | "whatsapp";

export const BOOKING_CHANNEL_LABELS: Record<BookingChannel, string> = {
  inapp: "In-app",
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

export const DEFAULT_BOOKING_CHANNELS: BookingChannel[] = ["inapp"];
export const DEFAULT_REMINDER_HOURS = 24;

/** Reminder timings offered in the booking dialog. */
export const REMINDER_HOUR_OPTIONS = [0, 2, 4, 12, 24, 48] as const;

export function reminderHoursLabel(hours: number): string {
  if (!hours || hours <= 0) return "No reminder";
  if (hours === 24) return "1 day before";
  if (hours === 48) return "2 days before";
  return `${hours} hours before`;
}

/** Channels a club may actually use, given what it has switched on. */
export function availableChannels(opts: {
  smsEnabled?: boolean | null;
  whatsappEnabled?: boolean | null;
}): BookingChannel[] {
  const list: BookingChannel[] = ["inapp", "email"];
  if (opts.smsEnabled) list.push("sms");
  if (opts.whatsappEnabled) list.push("whatsapp");
  return list;
}

export function normaliseChannels(
  raw: unknown,
  allowed: BookingChannel[],
): BookingChannel[] {
  const arr = Array.isArray(raw) ? raw.map((c) => String(c) as BookingChannel) : [];
  const kept = arr.filter((c) => allowed.includes(c));
  return kept.length ? kept : ["inapp"];
}

export type BookingMessageTarget = {
  userId?: string | null;
  memberId?: string | null;
  phone?: string | null;
};

/**
 * Send a booking confirmation / notice on the chosen channels.
 * In-app and email both ride on the notifications table (the database bridge
 * emails booking notifications unless `suppress_email` is set).
 */
export async function sendBookingMessage(opts: {
  clubId?: string | null;
  channels: BookingChannel[];
  targets: BookingMessageTarget[];
  title: string;
  text: string;
  url?: string;
  kind?: string;
}): Promise<void> {
  const channels = opts.channels || [];
  const wantsInApp = channels.includes("inapp");
  const wantsEmail = channels.includes("email");

  if (wantsInApp || wantsEmail) {
    const rows = opts.targets
      .filter((t) => !!t.userId)
      .map((t) => ({
        user_id: t.userId,
        club_member_id: t.memberId ?? null,
        title: opts.title,
        message: opts.text,
        type: "booking",
        url: opts.url ?? "/bookings",
        data: {
          kind: opts.kind ?? "booking_confirmation",
          club_id: opts.clubId ?? null,
          ...(wantsEmail ? {} : { suppress_email: "true" }),
        },
      }));
    if (rows.length) {
      try {
        await (supabase as any).from("notifications").insert(rows);
      } catch (e) {
        console.error("booking notification failed", e);
      }
    }
  }

  const phoneTargets = opts.targets
    .filter((t) => t.memberId || t.phone)
    .map((t) => ({ member_id: t.memberId ?? null, phone: t.phone ?? null }));

  if (channels.includes("sms") && phoneTargets.length && opts.clubId) {
    try {
      await sendSms({ clubId: opts.clubId, recipients: phoneTargets, body: opts.text, kind: opts.kind ?? "booking" });
    } catch (e) {
      console.error("booking sms failed", e);
    }
  }

  if (channels.includes("whatsapp") && phoneTargets.length && opts.clubId) {
    try {
      await sendWhatsApp({
        clubId: opts.clubId,
        recipients: phoneTargets,
        body: opts.text,
        kind: opts.kind ?? "booking",
        category: "utility",
        templateKey: "club_notice",
        templateVariables: { message: opts.text },
      });
    } catch (e) {
      console.error("booking whatsapp failed", e);
    }
  }
}

/** Remember the member's last channel/timing choice between bookings. */
const PREF_KEY = "sh.booking.notify";

export type BookingNotifyPref = { channels: BookingChannel[]; reminderHours: number; confirm: boolean };

export function loadBookingPref(fallback: BookingNotifyPref): BookingNotifyPref {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      channels: Array.isArray(parsed?.channels) && parsed.channels.length ? parsed.channels : fallback.channels,
      reminderHours: Number.isFinite(parsed?.reminderHours) ? Number(parsed.reminderHours) : fallback.reminderHours,
      confirm: typeof parsed?.confirm === "boolean" ? parsed.confirm : fallback.confirm,
    };
  } catch {
    return fallback;
  }
}

export function saveBookingPref(pref: BookingNotifyPref): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(pref));
  } catch {
    /* ignore */
  }
}
