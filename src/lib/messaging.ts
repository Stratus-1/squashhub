/**
 * One messaging switch per club, two channels chosen by SquashHub.
 *
 * A club turns "Member messaging" on or off — it never picks WhatsApp vs SMS.
 * The channel is decided by the message itself:
 *
 *   • reply expected  → WhatsApp  (tournament launches / invites, RSVPs,
 *                                  anything with Yes/No buttons or a link the
 *                                  member must act on in a conversation)
 *   • no reply needed → SMS       (next round is starting, make your booking,
 *                                  well done on your win, result alerts)
 *
 * If the chosen channel fails, we fall back to the other one so the member
 * still hears from the club.
 */
import { sendWhatsApp, type SendWhatsAppOptions } from "@/lib/whatsapp-send";
import { sendSms } from "@/lib/sms-send";

export type MessageRecipient = { member_id?: string | null; phone?: string | null };

export type MemberMessageOptions = {
  clubId: string;
  recipients: MessageRecipient[];
  /** Plain text of the message — used as-is on SMS, and on WhatsApp. */
  text: string;
  /** True when the member is expected to reply or act in the chat. */
  replyRequired?: boolean;
  kind?: string;
  critical?: boolean;
  /** WhatsApp template details (only used when WhatsApp is the channel). */
  templateKey?: string;
  templateVariables?: Record<string, string>;
  category?: SendWhatsAppOptions["category"];
  interaction?: SendWhatsAppOptions["interaction"];
};

export type MemberMessageResult = {
  channel: "whatsapp" | "sms";
  sent: number;
  total: number;
  fellBack: boolean;
};

export async function sendMemberMessage(
  opts: MemberMessageOptions,
): Promise<MemberMessageResult> {
  const total = opts.recipients.length;
  const wantsWhatsApp = !!opts.replyRequired;

  const viaWhatsApp = async () => {
    const r = await sendWhatsApp({
      clubId: opts.clubId,
      recipients: opts.recipients,
      body: opts.text,
      kind: opts.kind,
      category: opts.category ?? "utility",
      templateKey: opts.templateKey ?? "club_notice",
      templateVariables: opts.templateVariables ?? { message: opts.text },
      interaction: opts.interaction,
    });
    return { sent: Number(r?.sent ?? 0), total: Number(r?.total ?? total) };
  };

  const viaSms = async () => {
    const r = await sendSms({
      clubId: opts.clubId,
      recipients: opts.recipients,
      body: opts.text,
      kind: opts.kind,
      critical: opts.critical,
    });
    return { sent: Number(r?.sent ?? 0), total: Number(r?.total ?? total) };
  };

  const primary = wantsWhatsApp ? viaWhatsApp : viaSms;
  const secondary = wantsWhatsApp ? viaSms : viaWhatsApp;

  try {
    const r = await primary();
    if (r.sent > 0) {
      return { channel: wantsWhatsApp ? "whatsapp" : "sms", sent: r.sent, total: r.total, fellBack: false };
    }
  } catch {
    /* fall through to the other channel */
  }

  try {
    const r = await secondary();
    return { channel: wantsWhatsApp ? "sms" : "whatsapp", sent: r.sent, total: r.total, fellBack: true };
  } catch {
    return { channel: wantsWhatsApp ? "whatsapp" : "sms", sent: 0, total, fellBack: false };
  }
}
