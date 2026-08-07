/**
 * Server-initiated WhatsApp sending through the single shared SquashHub
 * sender number (Twilio). Every club uses the same number — the club name is
 * prefixed to the message / passed as a template variable.
 *
 * Use this only for automated messages (fee reminders, fixture notices,
 * tournament pairings). For anything a human initiates, keep using the free
 * click-to-chat helpers in `@/lib/whatsapp`.
 */
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

export type WhatsAppRecipient = {
  member_id?: string | null;
  phone?: string | null;
  variables?: Record<string, string>;
};

export type SendWhatsAppOptions = {
  clubId: string;
  recipients: WhatsAppRecipient[];
  /** Free-form text — only delivered inside the 24h reply window. */
  body?: string;
  /** Approved Twilio Content template SID (HX…) for out-of-window sends. */
  contentSid?: string;
  contentVariables?: Record<string, string>;
  kind?: string;
};

export type SendWhatsAppResult = {
  sent: number;
  total: number;
  results: Array<{
    member_id?: string | null;
    to?: string;
    status: "sent" | "failed" | "skipped";
    sid?: string | null;
    error?: string | null;
  }>;
};

export async function sendWhatsApp(opts: SendWhatsAppOptions): Promise<SendWhatsAppResult> {
  const { data, error } = await supabase.functions.invoke("send-whatsapp", {
    body: {
      club_id: opts.clubId,
      recipients: opts.recipients,
      body: opts.body,
      content_sid: opts.contentSid,
      content_variables: opts.contentVariables,
      kind: opts.kind,
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

  return data as SendWhatsAppResult;
}
