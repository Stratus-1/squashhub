import { supabase } from "@/integrations/supabase/client";
import { sendComms } from "@/lib/comms/send";
import { entryPayLinks, emailPayButton, payRoute } from "@/lib/smart-builder/step-handover";
import type { CommsChannel } from "@/lib/comms/actions";
import { matchDetailsFor, matchDetailsHtml, matchDetailsText, type DetailContext, type DetailMatch } from "@/lib/smart-builder/draw-match-details";

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
export const feeOutstandingLine = (cents: number) => `Your fee of R${(cents / 100).toFixed(2)} is outstanding. Use the "Pay my fee" button to pay by card, add it to your member account, or tell us you have already paid.`;

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
/** `stageKey` narrows to ONE structured stage (e.g. a Quarterfinal), so a later stage's Round 1 never
 *  picks up the Swiss/pool Round 1 players of the same category. `stageName` replaces "Round N" in copy. */
export type DrawScope = { round: number; groupNumber?: number; label?: string; stageKey?: string; stageName?: string };
export const drawScopeTitle = (scope: Pick<DrawScope, "round" | "stageName">) => scope.stageName || `Round ${scope.round}`;
const scopeQuery = (tournamentId: string, scope: DrawScope) => {
  let q: any = supabase.from("club_champs_matches").select("status, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id, bye_member_id").eq("champ_id", tournamentId).eq("round_number", scope.round);
  if (scope.groupNumber != null) q = q.eq("group_number", scope.groupNumber);
  if (scope.stageKey) q = q.eq("stage_key", scope.stageKey);
  return q;
};
/** "Ask me after each draw" is the default; only an explicit Off (draw_notify === false) skips the prompt. */
export function drawNotifyOn(betaLifecycle: any): boolean { return betaLifecycle?.draw_notify !== false; }
export const drawNoticeKey = (scope: DrawScope) => `${scope.groupNumber ?? "all"}:r${scope.round}${scope.stageKey ? `:s${scope.stageKey}` : ""}`;
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

/** Everything the per-player match block needs for this scope, read through the admin's normal access. */
export async function loadMatchDetailsContext(clubId: string, tournamentId: string, name: string, scope: DrawScope): Promise<DetailContext> {
  let q: any = supabase.from("club_champs_matches").select("id, group_number, round_number, stage_label, status, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id, bye_member_id, is_bye, scheduled_date, scheduled_time, court_id, play_by, booking_id").eq("champ_id", tournamentId).eq("round_number", scope.round);
  if (scope.groupNumber != null) q = q.eq("group_number", scope.groupNumber);
  if (scope.stageKey) q = q.eq("stage_key", scope.stageKey);
  const [{ data: matches, error }, { data: t }, { data: club }] = await Promise.all([
    q, (supabase as any).from("tournaments").select("builder_spec").eq("id", tournamentId).maybeSingle(),
    (supabase as any).from("clubs").select("name").eq("id", clubId).maybeSingle(),
  ]);
  if (error) throw error;
  const rows = (matches ?? []) as DetailMatch[];
  const ids = [...new Set(rows.flatMap((m) => [m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id, m.bye_member_id]).filter(Boolean) as string[])];
  const courtIds = [...new Set(rows.map((m) => m.court_id).filter(Boolean) as string[])];
  const bookingIds = [...new Set(rows.map((m) => m.booking_id).filter(Boolean) as string[])];
  const [mem, bk] = await Promise.all([
    ids.length ? supabase.from("club_members").select("id, name").in("id", ids) : Promise.resolve({ data: [] as any[] }),
    bookingIds.length ? (supabase as any).from("bookings").select("id, status, date, start_time, end_time, court_id").in("id", bookingIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const allCourts = [...new Set([...courtIds, ...((bk.data ?? []) as any[]).map((b) => b.court_id).filter(Boolean)])];
  const { data: cts } = allCourts.length ? await (supabase as any).from("courts").select("id, name, venue_name").in("id", allCourts) : { data: [] };
  const labels = new Map<number, string>(((t?.builder_spec?.divisions ?? []) as any[]).map((d) => [Number(d.groupNumber), String(d.label ?? "").replace(/ · Singles$| · Doubles$/, "")]));
  return {
    tournamentName: name, matches: rows,
    names: Object.fromEntries(((mem.data ?? []) as any[]).map((m) => [m.id, m.name ?? "Player"])),
    categoryOf: (g) => (g != null && labels.get(Number(g))) || (scope.label ?? (g != null ? `Category ${g}` : "Tournament")),
    courts: Object.fromEntries(((cts ?? []) as any[]).map((c) => [c.id, c])),
    bookings: Object.fromEntries(((bk.data ?? []) as any[]).map((b) => [b.id, b])),
    clubVenue: club?.name ?? null,
  };
}

/** Fee status + pay links for these players (empty when there is no fee). */
export async function loadDrawFeeContext(clubId: string, tournamentId: string, withLinks: boolean) {
  const [{ data: t }, { data: regs }] = await Promise.all([
    supabase.from("club_champs").select("entry_fee_cents, payment_required").eq("id", tournamentId).maybeSingle(),
    supabase.from("club_champs_registrations").select("club_member_id, paid_at, fee_paid_cents, fee_status, status").eq("champ_id", tournamentId),
  ]);
  const fee = (t as any)?.payment_required ? Number((t as any)?.entry_fee_cents ?? 0) : 0;
  const status = feeStatusFor(fee, ((regs ?? []) as any[]).filter((r) => !["withdrawn", "replaced", "cancelled"].includes(r.status)));
  const links: Record<string, string> = fee > 0 && withLinks ? await entryPayLinks(clubId, tournamentId) : {};
  return { fee, status, links };
}

/**
 * The ONE per-player composer used by both the admin preview and the real send:
 * saved wording + fee line (only when actually owed) + "Your match details" + Pay button.
 */
export function composeDrawNoticeVars(id: string, message: string, ctx: DetailContext, feeCtx: { fee: number; status: Record<string, { owes: boolean; outstanding: number }>; links: Record<string, string> } | null, tournamentId: string) {
  const st = feeCtx && feeCtx.fee > 0 ? feeCtx.status[id] : undefined;
  const line = st ? (st.owes ? feeOutstandingLine(st.outstanding) : FEE_PAID_LINE) : "";
  const text = line ? `${message.trim()}\n\n${line}` : message.trim();
  const items = matchDetailsFor(id, ctx);
  const detailsText = matchDetailsText(items);
  const link = st?.owes ? feeCtx?.links[id] : undefined;
  return {
    items,
    vars: {
      personal_message: detailsText ? `${text}\n\n${detailsText}` : text,
      personal_message_html: esc(text).replace(/\n/g, "<br>"),
      match_details_html: matchDetailsHtml(items),
      email_pay_html: st?.owes && link ? emailPayButton(link, "Pay my fee") : "",
      personal_message_plain: detailsText ? `${text}\n\n${detailsText}` : text,
      ...(st?.owes ? { pay_url: payRoute(tournamentId), pay_label: "Pay my fee" } : {}),
      ...(st?.owes && link ? { pay_link: link, pay_token: link.split("/i/").pop() || "" } : {}),
    } as Record<string, string>,
  };
}

export const DRAW_EMAIL_BODY = "<p>Dear {{name}},</p><p>{{personal_message_html}}</p>{{match_details_html}}{{email_pay_html}}";

export async function sendDrawNotice(clubId: string, tournamentId: string, name: string, message: string, channels: CommsChannel[], onlyIds?: string[], includeFee = true, scope: DrawScope = { round: 1 }, activation?: { include: boolean; intro: string }) {
  if (!message.trim() || message.length > 2000) throw new Error("Enter notification wording (up to 2,000 characters).");
  if (!channels.length) throw new Error("Choose a delivery channel.");
  const { data: tournament, error: tournamentError } = await supabase.from("tournaments").select("id").eq("id", tournamentId).eq("club_id", clubId).maybeSingle();
  if (tournamentError) throw tournamentError;
  if (!tournament) throw new Error("Tournament not found in this club.");
  const { data, error } = await scopeQuery(tournamentId, scope);
  if (error) throw error;
  const all = drawNoticeRecipients(data ?? []);
  const memberIds = onlyIds ? all.filter((id) => onlyIds.includes(id)) : all;
  if (!memberIds.length) throw new Error(`No ${drawScopeTitle(scope)} players to notify.`);
  const subject = `${name} — ${scope.label ? `${scope.label} · ` : ""}${drawScopeTitle(scope)} draw`;
  const ctx = await loadMatchDetailsContext(clubId, tournamentId, name, scope);
  const feeCtx = includeFee ? await loadDrawFeeContext(clubId, tournamentId, channels.some((c) => c === "email" || c === "whatsapp" || c === "sms")) : null;
  const memberVars: Record<string, Record<string, string>> = {};
  for (const id of memberIds) memberVars[id] = composeDrawNoticeVars(id, message, ctx, feeCtx, tournamentId).vars;
  const content = Object.fromEntries(channels.map((c) => [c, { subject, body: c === "email" ? DRAW_EMAIL_BODY : c === "in_app" ? "{{personal_message}}" : "{{personal_message_plain}}" }]));
  return sendComms({
    clubId, name: subject, channels, content, memberVars,
    audience: { type: "selected", memberIds },
    action: { key: "tournament_view", label: "View tournament & score match", params: { tournament_id: tournamentId } },
    meta: { tournament_id: tournamentId, purpose: "step_beta_round_draw", round: String(scope.round), group_number: String(scope.groupNumber ?? "all"), ...(scope.stageKey ? { stage_key: scope.stageKey } : {}),
      ...(activation?.include && channels.includes("email") ? { include_activation: "true", activation_intro: activation.intro.trim().slice(0, 300) } : {}) },
  });
}

/**
 * Test email to the signed-in admin's OWN member record in this club, showing the chosen player's
 * details. No pay link or activation link (those are personal to the player). Explicit click only.
 */
export async function sendDrawNoticeTest(clubId: string, tournamentId: string, name: string, message: string, scope: DrawScope, previewFor: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in first.");
  const { data: me } = await supabase.from("club_members").select("id, email").eq("club_id", clubId).eq("user_id", u.user.id).limit(1).maybeSingle();
  if (!me?.id || !(me as any).email) throw new Error("Your member record in this club has no email address.");
  const ctx = await loadMatchDetailsContext(clubId, tournamentId, name, scope);
  const feeCtx = await loadDrawFeeContext(clubId, tournamentId, false);
  const { vars } = composeDrawNoticeVars(previewFor, message, ctx, feeCtx, tournamentId);
  delete vars.pay_url; delete vars.pay_link; delete vars.pay_token;
  const subject = `[TEST] ${name} — ${scope.label ? `${scope.label} · ` : ""}${drawScopeTitle(scope)} draw (as ${ctx.names[previewFor] ?? "player"})`;
  return sendComms({
    clubId, name: subject, channels: ["email"], content: { email: { subject, body: DRAW_EMAIL_BODY } } as any,
    memberVars: { [me.id]: vars }, audience: { type: "selected", memberIds: [me.id] },
    action: { key: "tournament_view", label: "View tournament & score match", params: { tournament_id: tournamentId } },
    meta: { tournament_id: tournamentId, purpose: "step_beta_round_draw_test", round: String(scope.round) },
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

/* ---------- Saved wording + optional activation link (per tournament, server-side) ---------- */
export const DEFAULT_ACTIVATION_INTRO = "Not registered on SquashHub yet? Activate your account to view your draw and match details.";
export type DrawNoticeSettings = { message: string; includeActivation: boolean; activationIntro: string };
/** Saved wording for this notice key (falls back to the default), plus the tournament-wide activation choice. */
export function readDrawNoticeSettings(betaLifecycle: any, key: string, fallback: string): DrawNoticeSettings & { savedAt: string | null } {
  const t = betaLifecycle?.draw_notice_texts?.[key];
  const a = betaLifecycle?.draw_notice_activation ?? {};
  return {
    message: typeof t?.message === "string" && t.message.trim() ? t.message : fallback,
    includeActivation: a.include === true,
    activationIntro: typeof a.intro === "string" && a.intro.trim() ? a.intro : DEFAULT_ACTIVATION_INTRO,
    savedAt: t?.saved_at ?? a.saved_at ?? null,
  };
}
export function sameDrawNoticeSettings(a: DrawNoticeSettings, b: DrawNoticeSettings) {
  return a.message === b.message && a.includeActivation === b.includeActivation && a.activationIntro === b.activationIntro;
}
/** Saves wording only (never sends). Merges into the latest beta_lifecycle so other keys are never lost. */
export async function saveDrawNoticeSettings(tournamentId: string, key: string, s: DrawNoticeSettings) {
  if (!s.message.trim() || s.message.length > 2000) throw new Error("Enter notification wording (up to 2,000 characters).");
  if (s.activationIntro.length > 300) throw new Error("Keep the activation introduction under 300 characters.");
  const { data, error } = await (supabase as any).from("tournaments").select("beta_lifecycle").eq("id", tournamentId).maybeSingle();
  if (error) throw error;
  const bl = (data as any)?.beta_lifecycle ?? {};
  const at = new Date().toISOString();
  const next = { ...bl,
    draw_notice_texts: { ...(bl.draw_notice_texts ?? {}), [key]: { message: s.message, saved_at: at } },
    draw_notice_activation: { include: s.includeActivation, intro: s.activationIntro, saved_at: at } };
  const { error: upErr } = await (supabase as any).from("tournaments").update({ beta_lifecycle: next }).eq("id", tournamentId);
  if (upErr) throw upErr;
  return { at, betaLifecycle: next };
}

export type ActivationState = "registered" | "family_login" | "needs_activation" | "no_email" | "guest";
const okEmail = (e?: string | null) => !!e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim());
/** Mirrors the server: login → normal link; shared email with a linked login → that login; else a personal link if emailable. */
export function classifyActivation(members: Array<{ id: string; user_id?: string | null; email?: string | null; person_id?: string | null; role?: string | null; club_id?: string | null }>, linkedEmails: Set<string>, linkedPersons: Set<string> = new Set()): Record<string, ActivationState> {
  const out: Record<string, ActivationState> = {};
  for (const m of members) {
    const e = (m.email ?? "").trim().toLowerCase();
    out[m.id] = m.user_id || (m.person_id && linkedPersons.has(m.person_id)) ? "registered"
      : !m.person_id || m.role === "visitor" ? "guest"
      : !okEmail(e) ? "no_email" : linkedEmails.has(`${m.club_id ?? ""}|${e}`) ? "family_login" : "needs_activation";
  }
  return out;
}
export async function loadActivationStates(_clubId: string, memberIds: string[]) {
  if (!memberIds.length) return {} as Record<string, ActivationState>;
  const { data: mem } = await supabase.from("club_members").select("id, user_id, email, person_id, role, club_id").in("id", memberIds);
  const rows = (mem ?? []) as any[];
  const persons = [...new Set(rows.filter((m) => !m.user_id && m.person_id).map((m) => m.person_id))];
  const emails = [...new Set(rows.filter((m) => !m.user_id && m.email).map((m) => String(m.email).trim().toLowerCase()))];
  const [pl, el] = await Promise.all([
    persons.length ? supabase.from("club_members").select("person_id").in("person_id", persons).not("user_id", "is", null) : Promise.resolve({ data: [] }),
    emails.length ? supabase.from("club_members").select("club_id, email").in("email", emails).not("user_id", "is", null) : Promise.resolve({ data: [] }),
  ]) as any[];
  const linkedPersons = new Set<string>((pl.data ?? []).map((x: any) => x.person_id));
  const linkedEmails = new Set<string>((el.data ?? []).map((x: any) => `${x.club_id}|${String(x.email).trim().toLowerCase()}`));
  return classifyActivation(rows, linkedEmails, linkedPersons);
}
