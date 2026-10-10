import { supabase } from "@/integrations/supabase/client";
import { sendComms } from "@/lib/comms/send";
import { entryPayLinks, emailPayButton, payRoute } from "@/lib/smart-builder/step-handover";
import type { CommsChannel } from "@/lib/comms/actions";

export const DEFAULT_DRAW_NOTICE = "Your first-round match has been drawn. Open the tournament to view the draw, check your opponent and match details, score your match live, or submit your result afterwards.";

export function drawNoticeContent(subject: string, message: string, channels: CommsChannel[]) {
  const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
  return Object.fromEntries(channels.map((channel) => [channel, {
    subject, body: channel === "email" ? `<p>Dear {{name}},</p><p>${escape(message).replace(/\n/g, "<br>")}</p>` : message,
  }]));
}

export function drawNoticeRecipients(matches: Array<{ status?: string | null; player_a_member_id?: string | null; player_b_member_id?: string | null; partner_a_member_id?: string | null; partner_b_member_id?: string | null; bye_member_id?: string | null }>) {
  return [...new Set(matches.filter((m) => !["completed", "confirmed", "cancelled"].includes(m.status ?? "")).flatMap((m) => [m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id, m.bye_member_id]).filter((id): id is string => !!id))];
}

export const FEE_PAID_LINE = "Your fee has been paid.";
export const feeOutstandingLine = (cents: number) => `Your fee of R${(cents / 100).toFixed(2)} is outstanding. Please use the "Pay my fee" button to pay.`;

/** Per-player fee status from their own entry; partners without their own entry get no fee line. */
export function feeStatusFor(feeCents: number, regs: Array<{ club_member_id: string; paid_at?: string | null; fee_paid_cents?: number | null; fee_status?: string | null; status?: string | null }>) {
  const out: Record<string, { owes: boolean; outstanding: number }> = {};
  if (feeCents <= 0) return out;
  for (const r of regs) {
    // Entered/registered is not paid: only a settled fee status (paid, waived, on account) counts.
    const paid = Number(r.fee_paid_cents ?? 0);
    const settled = r.fee_status != null ? ["paid", "waived", "on_account"].includes(r.fee_status) : (!!r.paid_at || paid >= feeCents);
    const owes = !settled;
    out[r.club_member_id] = { owes, outstanding: owes ? Math.max(feeCents - paid, 0) || feeCents : 0 };
  }
  return out;
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));

/** Explicit send only; reuses the club-scoped Communications engine and its delivery log. */
export type DrawScope = { round: number; groupNumber?: number; label?: string };
const scopeQuery = (tournamentId: string, scope: DrawScope) => {
  let q: any = supabase.from("club_champs_matches").select("status, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id, bye_member_id").eq("champ_id", tournamentId).eq("round_number", scope.round);
  if (scope.groupNumber != null) q = q.eq("group_number", scope.groupNumber);
  return q;
};
/** "Ask me after each draw" is the default; only an explicit Off (draw_notify === false) skips the prompt. */
export function drawNotifyOn(betaLifecycle: any): boolean { return betaLifecycle?.draw_notify !== false; }
export const drawNoticeKey = (scope: DrawScope) => `${scope.groupNumber ?? "all"}:r${scope.round}`;
/** Log a sent draw notice on the tournament so revisits show "Sent" and offer Resend instead of re-prompting. */
export async function recordDrawNotice(tournamentId: string, key: string, sent: number) {
  const { data } = await (supabase as any).from("tournaments").select("beta_lifecycle").eq("id", tournamentId).maybeSingle();
  const bl = (data as any)?.beta_lifecycle ?? {};
  const log = { ...(bl.draw_notices ?? {}), [key]: { at: new Date().toISOString(), sent } };
  await (supabase as any).from("tournaments").update({ beta_lifecycle: { ...bl, draw_notices: log } }).eq("id", tournamentId);
}
export function drawNoticeSent(betaLifecycle: any, key: string): { at: string; sent: number } | null {
  return betaLifecycle?.draw_notices?.[key] ?? null;
}

export async function sendDrawNotice(clubId: string, tournamentId: string, name: string, message: string, channels: CommsChannel[], onlyIds?: string[], includeFee = true, scope: DrawScope = { round: 1 }) {
  if (!message.trim() || message.length > 2000) throw new Error("Enter notification wording (up to 2,000 characters).");
  if (!channels.length) throw new Error("Choose a delivery channel.");
  const { data: tournament, error: tournamentError } = await supabase.from("tournaments").select("id").eq("id", tournamentId).eq("club_id", clubId).maybeSingle();
  if (tournamentError) throw tournamentError;
  if (!tournament) throw new Error("Tournament not found in this club.");
  const { data, error } = await scopeQuery(tournamentId, scope);
  if (error) throw error;
  const all = drawNoticeRecipients(data ?? []);
  const memberIds = onlyIds ? all.filter((id) => onlyIds.includes(id)) : all;
  if (!memberIds.length) throw new Error(`No Round ${scope.round} players to notify.`);
  const subject = `${name} — ${scope.label ? `${scope.label} · ` : ""}Round ${scope.round} draw`;
  let memberVars: Record<string, Record<string, string>> | undefined;
  let content = drawNoticeContent(subject, message.trim(), channels);
  if (includeFee) {
    const [{ data: t }, { data: regs }] = await Promise.all([
      supabase.from("club_champs").select("entry_fee_cents, payment_required").eq("id", tournamentId).maybeSingle(),
      supabase.from("club_champs_registrations").select("club_member_id, paid_at, fee_paid_cents, fee_status, status").eq("champ_id", tournamentId),
    ]);
    const fee = (t as any)?.payment_required ? Number((t as any)?.entry_fee_cents ?? 0) : 0;
    const status = feeStatusFor(fee, ((regs ?? []) as any[]).filter((r) => !["withdrawn", "replaced", "cancelled"].includes(r.status)));
    if (fee > 0) {
      const links = channels.some((c) => c === "email" || c === "whatsapp" || c === "sms") ? await entryPayLinks(clubId, tournamentId) : {};
      memberVars = {};
      for (const id of memberIds) {
        const st = status[id];
        const line = st ? (st.owes ? feeOutstandingLine(st.outstanding) : FEE_PAID_LINE) : "";
        const text = line ? `${message.trim()}\n\n${line}` : message.trim();
        memberVars[id] = {
          personal_message: text, personal_message_html: esc(text).replace(/\n/g, "<br>"),
          email_pay_html: st?.owes && links[id] ? emailPayButton(links[id], "Pay my fee") : "",
          // The pay link lives in pay_link / pay_token: the WhatsApp sender turns
          // it into a tappable "Pay my fee" button (approved template) or appends
          // it as plain text; it is never pasted into the message body itself.
          personal_message_plain: text,
          ...(st?.owes ? { pay_url: payRoute(tournamentId), pay_label: "Pay my fee" } : {}),
          ...(st?.owes && links[id] ? { pay_link: links[id], pay_token: links[id].split("/i/").pop() || "" } : {}),
        };
      }
      content = Object.fromEntries(channels.map((c) => [c, { subject, body: c === "email" ? "<p>Dear {{name}},</p><p>{{personal_message_html}}</p>{{email_pay_html}}" : c === "in_app" ? "{{personal_message}}" : "{{personal_message_plain}}" }]));
    }
  }
  return sendComms({
    clubId, name: subject, channels, content, memberVars,
    audience: { type: "selected", memberIds },
    action: { key: "tournament_view", label: "View tournament & score match", params: { tournament_id: tournamentId } },
    meta: { tournament_id: tournamentId, purpose: "step_beta_round_draw", round: String(scope.round), group_number: String(scope.groupNumber ?? "all") },
  });
}
/** Round 1 players (for picking who gets the notice), sorted by name. */
export async function loadDrawNoticeRecipients(tournamentId: string, scope: DrawScope = { round: 1 }) {
  const { data, error } = await scopeQuery(tournamentId, scope);
  if (error) throw error;
  const ids = drawNoticeRecipients(data ?? []);
  if (!ids.length) return [];
  const { data: mem } = await supabase.from("club_members").select("id, name").in("id", ids);
  const names = new Map((mem ?? []).map((m: any) => [m.id, m.name as string]));
  return ids.map((id) => ({ id, name: names.get(id) ?? "Unknown player" })).sort((a, b) => a.name.localeCompare(b.name));
}
