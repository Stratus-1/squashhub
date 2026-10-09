import { supabase } from "@/integrations/supabase/client";
import { sendComms } from "@/lib/comms/send";
import type { CommsChannel } from "@/lib/comms/actions";

export const DEFAULT_DRAW_NOTICE = "Your first-round match has been drawn. Open the tournament to view the draw, check your opponent and match details, score your match live, or submit your result afterwards.";

export function drawNoticeContent(subject: string, message: string, channels: CommsChannel[]) {
  const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
  return Object.fromEntries(channels.map((channel) => [channel, {
    subject, body: channel === "email" ? `<p>${escape(message).replace(/\n/g, "<br>")}</p>` : message,
  }]));
}

export function drawNoticeRecipients(matches: Array<{ status?: string | null; player_a_member_id?: string | null; player_b_member_id?: string | null; partner_a_member_id?: string | null; partner_b_member_id?: string | null; bye_member_id?: string | null }>) {
  return [...new Set(matches.filter((m) => !["completed", "confirmed", "cancelled"].includes(m.status ?? "")).flatMap((m) => [m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id, m.bye_member_id]).filter((id): id is string => !!id))];
}

/** Explicit send only; reuses the club-scoped Communications engine and its delivery log. */
export async function sendDrawNotice(clubId: string, tournamentId: string, name: string, message: string, channels: CommsChannel[]) {
  if (!message.trim() || message.length > 2000) throw new Error("Enter notification wording (up to 2,000 characters).");
  if (!channels.length) throw new Error("Choose a delivery channel.");
  const { data: tournament, error: tournamentError } = await supabase.from("tournaments").select("id").eq("id", tournamentId).eq("club_id", clubId).maybeSingle();
  if (tournamentError) throw tournamentError;
  if (!tournament) throw new Error("Tournament not found in this club.");
  const { data, error } = await supabase.from("club_champs_matches").select("status, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id, bye_member_id").eq("champ_id", tournamentId).eq("round_number", 1);
  if (error) throw error;
  const memberIds = drawNoticeRecipients(data ?? []);
  if (!memberIds.length) throw new Error("No Round 1 players to notify.");
  return sendComms({
    clubId, name: `${name} — Round 1 draw`, channels,
    content: drawNoticeContent(`${name} — Round 1 draw`, message.trim(), channels),
    audience: { type: "selected", memberIds },
    action: { key: "tournament_view", label: "View tournament & score match", params: { tournament_id: tournamentId } },
    meta: { tournament_id: tournamentId, purpose: "step_beta_round_draw" },
  });
}