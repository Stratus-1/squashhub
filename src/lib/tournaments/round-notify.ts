/**
 * Round-draw notifications.
 *
 * When a knockout round draw is confirmed, every player in that round gets the
 * SAME message — opponent full name, opponent phone number and the exact
 * deadline for the round — through exactly the channels enabled for that
 * tournament (`club_champs.invite_methods`: app / email / whatsapp). A channel
 * that was not enabled is never used.
 *
 * The message itself, the channel gating and the in-app/email delivery are all
 * server-side (`public.notify_champ_round_draw`), so the wording can never
 * drift between channels. The RPC hands back the WhatsApp payloads it did NOT
 * send (WhatsApp goes out through the send-whatsapp edge function) already
 * containing the identical text.
 */
import { supabase } from "@/integrations/supabase/client";
import { sendWhatsApp } from "@/lib/whatsapp-send";

export type RoundDrawNotifyScope = {
  champId: string;
  clubId?: string | null;
  roundNumber: number;
  groupNumber?: number | null;
  sections?: number[] | null;
};

export type RoundDrawNotifyResult = {
  sent: number;
  channels: string[];
  whatsappSent: number;
  whatsappFailed: number;
};

/** Human summary for the confirmation toast. */
export function roundNotifySummary(r: RoundDrawNotifyResult): string {
  if (r.sent === 0) return "No players to notify for this round.";
  const chans = r.channels.filter((c) => ["app", "email", "whatsapp"].includes(c));
  const label = chans
    .map((c) => (c === "app" ? "in-app" : c === "email" ? "email" : "WhatsApp"))
    .join(" + ");
  return `Notified ${r.sent} player${r.sent === 1 ? "" : "s"} via ${label || "no channel"}.`;
}

export async function notifyRoundDraw(scope: RoundDrawNotifyScope): Promise<RoundDrawNotifyResult> {
  const { data, error } = await (supabase as any).rpc("notify_champ_round_draw", {
    p_champ_id: scope.champId,
    p_round_number: scope.roundNumber,
    p_group_number: scope.groupNumber ?? null,
    p_sections: scope.sections && scope.sections.length ? scope.sections : null,
  });
  if (error) throw error;

  const channels: string[] = Array.isArray(data?.channels) ? data.channels : [];
  const waList: Array<{ member_id: string; message: string }> = Array.isArray(data?.whatsapp)
    ? data.whatsapp
    : [];

  let whatsappSent = 0;
  let whatsappFailed = 0;
  if (channels.includes("whatsapp") && waList.length > 0) {
    let clubId = scope.clubId ?? null;
    if (!clubId) {
      const { data: champ } = await (supabase as any)
        .from("club_champs")
        .select("club_id")
        .eq("id", scope.champId)
        .maybeSingle();
      clubId = champ?.club_id ?? null;
    }
    for (const w of waList) {
      if (!clubId) {
        whatsappFailed += 1;
        continue;
      }
      try {
        await sendWhatsApp({
          clubId,
          recipients: [{ member_id: w.member_id }],
          kind: "champ_round_draw",
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
  }

  return {
    sent: Number(data?.sent ?? 0),
    channels,
    whatsappSent,
    whatsappFailed,
  };
}
