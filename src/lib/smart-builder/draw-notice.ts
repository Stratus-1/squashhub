import { supabase } from "@/integrations/supabase/client";
import { sendComms } from "@/lib/comms/send";
import { entryPayLinks, emailPayButton, payRoute } from "@/lib/smart-builder/step-handover";
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

export const FEE_PAID_LINE = "Your fee has been paid.";
export const feeOutstandingLine = (cents: number) => `Your fee of R${(cents / 100).toFixed(2)} is outstanding. Please use the "Pay my fee" button to pay.`;

/** Per-player fee status from their own entry; partners without their own entry get no fee line. */
export function feeStatusFor(feeCents: number, regs: Array<{ club_member_id: string; paid_at?: string | null; fee_paid_cents?: number | null }>) {
  const out: Record<string, { owes: boolean; outstanding: number }> = {};
  if (feeCents <= 0) return out;
  for (const r of regs) {
    const paid = Number(r.fee_paid_cents ?? 0);
    const owes = !r.paid_at && paid < feeCents;
    out[r.club_member_id] = { owes, outstanding: owes ? feeCents - paid : 0 };
  }
  return out;
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));

/** Explicit send only; reuses the club-scoped Communications engine and its delivery log. */
export async function sendDrawNotice(clubId: string, tournamentId: string, name: string, message: string, channels: CommsChannel[], onlyIds?: string[], includeFee = false) {
  if (!message.trim() || message.length > 2000) throw new Error("Enter notification wording (up to 2,000 characters).");
  if (!channels.length) throw new Error("Choose a delivery channel.");
  const { data: tournament, error: tournamentError } = await supabase.from("tournaments").select("id").eq("id", tournamentId).eq("club_id", clubId).maybeSingle();
  if (tournamentError) throw tournamentError;
  if (!tournament) throw new Error("Tournament not found in this club.");
  const { data, error } = await supabase.from("club_champs_matches").select("status, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id, bye_member_id").eq("champ_id", tournamentId).eq("round_number", 1);
  if (error) throw error;
  const all = drawNoticeRecipients(data ?? []);
  const memberIds = onlyIds ? all.filter((id) => onlyIds.includes(id)) : all;
  if (!memberIds.length) throw new Error("No Round 1 players to notify.");
  const subject = `${name} — Round 1 draw`;
  let memberVars: Record<string, Record<string, string>> | undefined;
  let content = drawNoticeContent(subject, message.trim(), channels);
  if (includeFee) {
    const [{ data: t }, { data: regs }] = await Promise.all([
      supabase.from("club_champs").select("entry_fee_cents, payment_required").eq("id", tournamentId).maybeSingle(),
      supabase.from("club_champs_registrations").select("club_member_id, paid_at, fee_paid_cents, status").eq("champ_id", tournamentId),
    ]);
    const fee = (t as any)?.payment_required ? Number((t as any)?.entry_fee_cents ?? 0) : 0;
    const status = feeStatusFor(fee, ((regs ?? []) as any[]).filter((r) => !["withdrawn", "replaced", "cancelled"].includes(r.status)));
    if (fee > 0) {
      const links = channels.includes("email") ? await entryPayLinks(clubId, tournamentId) : {};
      memberVars = {};
      for (const id of memberIds) {
        const st = status[id];
        const line = st ? (st.owes ? feeOutstandingLine(st.outstanding) : FEE_PAID_LINE) : "";
        const text = line ? `${message.trim()}\n\n${line}` : message.trim();
        memberVars[id] = {
          personal_message: text, personal_message_html: esc(text).replace(/\n/g, "<br>"),
          email_pay_html: st?.owes && links[id] ? emailPayButton(links[id], "Pay my fee") : "",
          ...(st?.owes ? { pay_url: payRoute(tournamentId), pay_label: "Pay my fee" } : {}),
        };
      }
      content = Object.fromEntries(channels.map((c) => [c, { subject, body: c === "email" ? "<p>{{personal_message_html}}</p>{{email_pay_html}}" : "{{personal_message}}" }]));
    }
  }
  return sendComms({
    clubId, name: subject, channels, content, memberVars,
    audience: { type: "selected", memberIds },
    action: { key: "tournament_view", label: "View tournament & score match", params: { tournament_id: tournamentId } },
    meta: { tournament_id: tournamentId, purpose: "step_beta_round_draw" },
  });
}
/** Round 1 players (for picking who gets the notice), sorted by name. */
export async function loadDrawNoticeRecipients(tournamentId: string) {
  const { data, error } = await supabase.from("club_champs_matches").select("status, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id, bye_member_id").eq("champ_id", tournamentId).eq("round_number", 1);
  if (error) throw error;
  const ids = drawNoticeRecipients(data ?? []);
  if (!ids.length) return [];
  const { data: mem } = await supabase.from("club_members").select("id, name").in("id", ids);
  const names = new Map((mem ?? []).map((m: any) => [m.id, m.name as string]));
  return ids.map((id) => ({ id, name: names.get(id) ?? "Unknown player" })).sort((a, b) => a.name.localeCompare(b.name));
}
