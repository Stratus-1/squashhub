/**
 * Doubles-pair notifications.
 *
 * A pairing message (admin pre-selection, partner request, or the
 * "complete your registration" prompt for the second partner) is composed
 * server-side by `public.notify_doubles_pair` so the wording is identical on
 * every channel, and it is delivered through exactly the channels chosen in
 * tournament setup (`invite_methods`: app / email / whatsapp). A channel that
 * was not enabled is never used.
 */
import { supabase } from "@/integrations/supabase/client";
import { sendWhatsApp } from "@/lib/whatsapp-send";

export type PairNotifyResult = {
  sent: number;
  channels: string[];
  whatsappSent: number;
  whatsappFailed: number;
  status?: string;
};

export function pairNotifySummary(r: PairNotifyResult): string {
  if (r.sent === 0) return "No pairing messages were sent.";
  const label = r.channels
    .filter((c) => ["app", "email", "whatsapp"].includes(c))
    .map((c) => (c === "app" ? "in-app" : c === "email" ? "email" : "WhatsApp"))
    .join(" + ");
  return `Notified ${r.sent} player${r.sent === 1 ? "" : "s"} via ${label || "no channel"}.`;
}

export async function notifyDoublesPair(
  pairId: string,
  clubId?: string | null,
  auth: { token?: string | null; verify?: string | null } = {},
): Promise<PairNotifyResult> {
  // Invitation-link players (not signed in) prove who they are with their link token + check.
  const { data, error } = await (supabase as any).rpc("notify_doubles_pair", {
    p_pair_id: pairId,
    p_token: auth.token || null,
    p_verify: auth.verify || null,
  });
  if (error) throw error;

  const channels: string[] = Array.isArray(data?.channels) ? data.channels : [];
  const waList: Array<{ member_id: string; message: string }> = Array.isArray(data?.whatsapp)
    ? data.whatsapp
    : [];
  const club = clubId || (data?.club_id ? String(data.club_id) : null);

  let whatsappSent = 0;
  let whatsappFailed = 0;
  if (channels.includes("whatsapp") && waList.length > 0 && club) {
    for (const w of waList) {
      try {
        await sendWhatsApp({
          clubId: club,

          recipients: [{ member_id: w.member_id }],
          kind: "champ_doubles_pair",
          category: "utility",
          templateKey: "club_notice",
          templateVariables: { message: w.message },
          body: w.message,
        });
        whatsappSent += 1;
      } catch {
        whatsappFailed += 1;
      }
    }
  } else if (channels.includes("whatsapp") && waList.length > 0) {
    whatsappFailed = waList.length;
  }

  return {
    sent: Number(data?.sent ?? 0),
    channels,
    whatsappSent,
    whatsappFailed,
    status: data?.status ? String(data.status) : undefined,
  };
}
