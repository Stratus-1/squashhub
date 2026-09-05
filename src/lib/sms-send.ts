/**
 * Club SMS sending through the platform gateway (Super Admin → Settings → SMS).
 *
 * SMS is the one-way channel: short notices where no reply is expected
 * (next round starting, book your court, well done on your win, reminders).
 * When a reply IS expected, use WhatsApp (`@/lib/whatsapp-send`) instead — the
 * router in `@/lib/messaging` picks the right one automatically.
 */
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

export type SmsRecipient = {
  member_id?: string | null;
  phone?: string | null;
  /** Per-recipient override of the shared body. */
  body?: string | null;
};

export type SendSmsOptions = {
  clubId?: string | null;
  /** Platform notice (invoices, trials) — no club opt-in check. */
  platform?: boolean;
  recipients: SmsRecipient[];
  body?: string;
  kind?: string;
  /** Payment / security / account messages ignore marketing opt-out. */
  critical?: boolean;
};

export type SendSmsResult = {
  sent: number;
  total: number;
  results: Array<{
    member_id?: string | null;
    to?: string;
    status: "sent" | "failed" | "skipped";
    error?: string | null;
  }>;
};

export async function sendSms(opts: SendSmsOptions): Promise<SendSmsResult> {
  const { data, error } = await supabase.functions.invoke("send-sms", {
    body: {
      club_id: opts.clubId ?? null,
      platform: opts.platform ?? false,
      recipients: opts.recipients,
      body: opts.body,
      kind: opts.kind,
      critical: opts.critical ?? false,
    },
  });

  if (error) {
    let detail = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const parsed = await error.context.json();
        detail = parsed?.error ?? detail;
      } catch {
        /* keep the generic message */
      }
    }
    throw new Error(detail);
  }

  return data as SendSmsResult;
}
