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
import { sendMemberMessage } from "@/lib/messaging";

export type RoundDrawNotifyScope = {
  champId: string;
  clubId?: string | null;
  roundNumber: number;
  groupNumber?: number | null;
  sections?: number[] | null;
  /** Structured stage key: only that stage's games (rounds restart per stage). */
  stageKey?: string | null;
  /** Skip the "send now?" question (caller already asked the organiser). */
  skipPrompt?: boolean;
};

export type RoundDrawNotifyResult = {
  sent: number;
  channels: string[];
  whatsappSent: number;
  whatsappFailed: number;
  /** True when the organiser chose not to send (e.g. still testing the draw). */
  skipped?: boolean;
};

/**
 * Generating, regenerating or confirming a draw NEVER messages players.
 * Only an explicit organiser send (e.g. "Send draw to players", which passes
 * `skipPrompt: true` after its own confirmation) reaches the backend.
 */
export function askSendDrawNotices(_champId: string): boolean {
  return false;
}

/** Human summary for the confirmation toast. */
export function roundNotifySummary(r: RoundDrawNotifyResult): string {
  if (r.skipped) return "Draw saved — players were NOT notified. Use \"Send draw to players\" when you're ready.";
  if (r.sent === 0) return "No players to notify for this round.";
  const chans = r.channels.filter((c) => ["app", "email", "whatsapp"].includes(c));
  const label = chans
    .map((c) => (c === "app" ? "in-app" : c === "email" ? "email" : "WhatsApp"))
    .join(" + ");
  return `Notified ${r.sent} player${r.sent === 1 ? "" : "s"} via ${label || "no channel"}.`;
}

export async function notifyRoundDraw(scope: RoundDrawNotifyScope): Promise<RoundDrawNotifyResult> {
  if (!scope.skipPrompt) {
    // Draw generation paths call this without an explicit send: never dispatch.
    return { sent: 0, channels: [], whatsappSent: 0, whatsappFailed: 0, skipped: true };
  }
  const { data, error } = await (supabase as any).rpc("notify_champ_round_draw", {
    p_champ_id: scope.champId,
    p_round_number: scope.roundNumber,
    p_group_number: scope.groupNumber ?? null,
    p_sections: scope.sections && scope.sections.length ? scope.sections : null,
    p_stage_key: scope.stageKey ?? null,
  });
  if (error) throw error;

  const channels: string[] = Array.isArray(data?.channels) ? data.channels : [];
  const waList: Array<{ member_id: string; message: string; sms?: string }> = Array.isArray(data?.whatsapp)
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
        // Round draws are one-way notices ("your next match / make your
        // booking") — SMS by default, WhatsApp only as a fallback.
        const r = await sendMemberMessage({
          clubId,
          recipients: [{ member_id: w.member_id }],
          text: w.message,
          smsText: w.sms,
          replyRequired: false,
          kind: "champ_round_draw",
        });
        if (r.sent > 0) whatsappSent += 1;
        else whatsappFailed += 1;
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
