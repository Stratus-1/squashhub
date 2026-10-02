/**
 * Step-by-Step Beta → Tournament Management handover.
 *
 * Summary is the handover point: "Complete setup & continue" creates the tournament
 * record through the same `club_champs` insert the Current Builder uses (no schema
 * change), enters admin-picked players as registrations that stay payment-outstanding,
 * and saves a handover record (lifecycle position + deferred decisions + the shared
 * message snapshot) on this device. Nothing is sent and no payment is taken here.
 */
import { fromExt } from "@/lib/supabase-ext";
import { sendComms, dispatchCampaign } from "@/lib/comms/send";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeDraftPayload } from "@/lib/tournaments/draft-payload";

export const LIFECYCLE = [
  { key: "planning", label: "Planning" },
  { key: "invite", label: "Invite / Inform players" },
  { key: "registrations", label: "Registrations & payments" },
  { key: "finalise", label: "Finalise entries" },
  { key: "generate", label: "Generate draw & fixtures" },
  { key: "activate", label: "Activate tournament" },
  { key: "running", label: "Tournament running" },
  { key: "complete", label: "Complete" },
] as const;
export type LifecycleKey = (typeof LIFECYCLE)[number]["key"];
export const lifecycleIndex = (k: LifecycleKey) => LIFECYCLE.findIndex((s) => s.key === k);

/** A "Decide later" answer: deferred, not forgotten — due at a lifecycle stage. */
export type DeferredDecision = { id: string; label: string; neededAt: LifecycleKey; why: string };

export type EntrantMessage = { memberId: string; name: string; text: string; status: "Entered · Payment outstanding" | "Entered" };

export type Handover = {
  tournamentId: string;
  clubId: string;
  name: string;
  kind: "once_off" | "period";
  /** invite = players self-enter; inform = admin picked everyone (notification, not invitation). */
  mode: "invite" | "inform";
  feeDue: boolean;
  channels: string[];
  messageTemplate: string;
  /** Inform mode: one personalised message per entered player (partner + amount due). */
  entrantMessages: EntrantMessage[];
  /** Invite mode: one sample invitation. */
  invitePreview: string;
  deferred: DeferredDecision[];
  /** Expected entries per category/subcategory (estimates from setup), compared at Finalise entries. */
  expected?: Array<{ label: string; expected: number | null; doubles: boolean }>;
  stage: LifecycleKey;
  completed: LifecycleKey[];
  informedAt?: string | null;
  /** Organiser's WhatsApp group (central copy in tournament_whatsapp_groups). */
  waGroup?: { url: string; include: boolean } | null;
  createdAt: string;
};

const hkey = (clubId: string) => `sh.stepbuilder.handover.${clubId}`;
export function loadHandovers(clubId: string): Handover[] {
  try { return JSON.parse(localStorage.getItem(hkey(clubId)) || "[]") as Handover[]; } catch { return []; }
}
export function loadHandover(clubId: string, tid: string) { return loadHandovers(clubId).find((h) => h.tournamentId === tid) ?? null; }
export function saveHandover(h: Handover) {
  const all = loadHandovers(h.clubId).filter((x) => x.tournamentId !== h.tournamentId);
  localStorage.setItem(hkey(h.clubId), JSON.stringify([h, ...all]));
}

/** Deferred items that must be resolved before a stage's action can be taken. */
export const blockersFor = (h: Pick<Handover, "deferred">, stage: LifecycleKey) => h.deferred.filter((d) => d.neededAt === stage);

/** The single prominent next action for the current lifecycle stage. */
export function nextAction(h: Handover): { title: string; detail: string; available: boolean } {
  if (h.stage === "invite") {
    const blocked = blockersFor(h, "invite");
    if (h.mode === "inform") return { title: "Inform selected players", detail: `Tell the ${h.entrantMessages.length} entered player${h.entrantMessages.length === 1 ? "" : "s"} they have been entered${h.feeDue ? ", what they owe and how to pay" : ""}.`, available: blocked.length === 0 };
    return { title: "Invite players", detail: "Send the invitation so eligible players can enter.", available: blocked.length === 0 };
  }
  if (h.stage === "registrations") return { title: "Close registrations & finalise entries", detail: "When entries and payments are in, move on to check the final field.", available: true };
  if (h.stage === "finalise") {
    const blocked = blockersFor(h, "finalise");
    return { title: "Generate draw & fixtures", detail: blocked.length ? "Decide the items below first — they depend on the real entries, so they're asked for now." : "Everything needed is decided. Continue to confirm the format and generate the draw.", available: blocked.length === 0 };
  }
  if (h.stage === "generate") return { title: "Generate draw & fixtures", detail: "Confirm the final format for the current entries, check the preview, then generate the draw.", available: true };
  if (h.stage === "activate") return { title: "Activate tournament", detail: "Draw and fixtures are saved. Review them from the Generate draw & fixtures stage. Activation is the next Beta build.", available: false };
  return { title: LIFECYCLE[lifecycleIndex(h.stage)].label, detail: "Not part of this Beta yet.", available: false };
}

export type CreateInput = {
  clubId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  feeCents: number | null;
  paymentMethods: string[];
  partnerMode: "admin" | "players" | null;
  /** Admin-entered players (pairs carry a partner). */
  entrants: Array<{ memberId: string; partnerId?: string | null; division?: number | null }>;
  /** Step-by-Step categories/subcategories, in order — become the tournament's divisions (group 1..n). */
  divisions?: Array<{ label: string; matchType: "singles" | "doubles"; serving?: "even_odd" | "by_position" | "second_server" | null }>;
  existingId?: string | null;
  /** undefined = not decided (leave as is); null = no group; object = organiser's invite link. */
  waGroup?: { url: string; include: boolean; name: string } | null;
  /** undefined = leave as is; maps to the Current Builder's tournaments.result_notify_scope / _channels. */
  /** Maps to the existing tournament payment_timing: true → on_entry, false → after_acceptance. */
  confirmNeedsPay?: boolean;
  resultNotify?: { scope: "all" | "playoffs" | "never"; channels: string[] };
  /** Fees & Payment doubles answer: may one partner pay the other's fee. undefined = leave as is. */
  partnerPay?: boolean | null;
};

/**
 * Create (or, when re-completing, update) the tournament record, then enter admin-picked
 * players. Admin selection never marks anyone paid: with a fee they are `pending_payment`.
 * Re-running syncs the active entrant set (step_sync_admin_entrants): adds, updates and withdraws.
 */
export async function persistStepTournament(i: CreateInput): Promise<string> {
  const row = sanitizeDraftPayload({
    club_id: i.clubId,
    name: i.name.trim(),
    start_date: i.startDate || null,
    end_date: i.endDate || null,
    entry_fee_cents: i.feeCents ?? 0,
    payment_required: (i.feeCents ?? 0) > 0,
    ...(i.confirmNeedsPay !== undefined ? { payment_timing: i.confirmNeedsPay ? "on_entry" : "after_acceptance" } : {}),
    payment_methods: i.paymentMethods.length ? i.paymentMethods : null,
    ...(i.partnerMode ? { partner_mode: i.partnerMode } : {}),
    ...(i.resultNotify ? { result_notify_scope: i.resultNotify.scope, result_notify_channels: i.resultNotify.channels.length ? i.resultNotify.channels : ["email"] } : {}),
    // Map categories → divisions so the table default (2 unnamed divisions) never applies.
    ...(i.divisions?.length ? {
      num_groups: i.divisions.length,
      group_labels: Object.fromEntries(i.divisions.map((d, n) => [String(n + 1), d.label])),
    } : { num_groups: 1 }),
    description: "Set up with the Step-by-Step Beta builder.",
  });
  let tid = i.existingId ?? null;
  if (tid) {
    const { error } = await fromExt("club_champs").update(row).eq("id", tid);
    if (error) throw error;
  } else {
    const { data, error } = await fromExt("club_champs").insert({ ...row, status: "planning" }).select("id").single();
    if (error) throw error;
    tid = data.id as string;
  }
  if (i.divisions?.length) {
    // league_match_types lives only on the base table (not the club_champs view).
    const serving = Object.fromEntries(i.divisions.flatMap((d, n) => d.matchType === "doubles" && d.serving ? [[String(n + 1), d.serving]] : []));
    const { error } = await fromExt("tournaments").update({ league_match_types: Object.fromEntries(i.divisions.map((d, n) => [String(n + 1), d.matchType])), ...(i.divisions.some((d) => d.serving !== undefined) ? { league_doubles_serving_methods: Object.keys(serving).length ? serving : null } : {}) }).eq("id", tid);
    if (error) throw error;
  }
  if (i.waGroup !== undefined) await syncWaGroup(tid!, i.clubId, i.waGroup);
  if (i.partnerPay !== undefined) {
    const cur = (await loadLifecycle(tid!)) ?? ({ stage: "invite", completed: ["planning"] } as BetaLifecycle);
    await saveLifecycle(tid!, { ...cur, partner_pay: i.partnerPay });
  }
  if (i.entrants.length) {
    const nDiv = Math.max(1, i.divisions?.length ?? 1);
    const missing = i.entrants.filter((e) => nDiv > 1 && !(e.division && e.division >= 1 && e.division <= nDiv));
    if (missing.length) throw new Error(`${missing.length} picked player${missing.length === 1 ? " is" : "s are"} not placed in a category yet — go back to "Select & pair players" and place them.`);
    // One source of truth: the server syncs the active set of organiser-entered players
    // (add / update partner+category / withdraw players no longer picked), so a
    // replacement is one-for-one and never leaves the outgoing player counted.
    const { error } = await (supabase as any).rpc("step_sync_admin_entrants", {
      p_champ_id: tid,
      p_fee_due: (i.feeCents ?? 0) > 0,
      p_entrants: i.entrants.map((e) => ({
        memberId: e.memberId, partnerId: e.partnerId ?? null,
        division: nDiv > 1 ? (e.division as number) : 1,
      })),
    });
    if (error) {
      if (!i.existingId) await fromExt("tournaments").delete().eq("id", tid);
      throw error;
    }
  }
  return tid!;
}

/** Reuse the existing tournament_whatsapp_groups record (one per tournament); "include" lives on beta_lifecycle. */
async function syncWaGroup(tid: string, clubId: string, g: { url: string; include: boolean; name: string } | null) {
  if (g) {
    const { error } = await fromExt("tournament_whatsapp_groups").upsert({ champ_id: tid, club_id: clubId, provider: "manual", invite_url: g.url, group_name: g.name, status: "active", closed_at: null }, { onConflict: "champ_id" });
    if (error) throw error;
  } else {
    await fromExt("tournament_whatsapp_groups").update({ status: "archived", closed_at: new Date().toISOString() }).eq("champ_id", tid).eq("status", "active");
  }
  const cur = (await loadLifecycle(tid)) ?? ({ stage: "invite", completed: ["planning"] } as BetaLifecycle);
  await saveLifecycle(tid, { ...cur, wa_include: !!g?.include });
}

/* ── Inform selected players: real sends through the Communications engine ── */

export type BetaLifecycle = {
  stage: LifecycleKey; completed: LifecycleKey[];
  wa_include?: boolean;
  /** Fees & Payment "A player may pay for both partners" — read server-side by step_pair_payment_context. */
  partner_pay?: boolean | null;
  /** Draw-relevant setup answers (format incl. within/between/custom matchups, seeding, stages, play-offs) so Generate draw works on any device. */
  format_plan?: Record<string, unknown> | null;
  inform?: { method: "sent" | "manual"; campaign_id?: string | null; at: string; by?: string | null; note?: string; resend_campaign_ids?: string[] };
};

/** Lifecycle is persisted on the tournament (tournaments.beta_lifecycle), not just this device. */
export async function loadLifecycle(tournamentId: string): Promise<BetaLifecycle | null> {
  const { data } = await fromExt("tournaments").select("beta_lifecycle").eq("id", tournamentId).maybeSingle();
  return ((data as any)?.beta_lifecycle as BetaLifecycle) ?? null;
}
export async function saveLifecycle(tournamentId: string, l: BetaLifecycle) {
  // Never drop the saved setup (format_plan) when a caller holds an older lifecycle copy without it.
  let next = l;
  if (l.format_plan === undefined) { const cur = await loadLifecycle(tournamentId).catch(() => null); if (cur?.format_plan) next = { ...l, format_plan: cur.format_plan }; }
  const { error } = await fromExt("tournaments").update({ beta_lifecycle: next }).eq("id", tournamentId);
  if (error) throw error;
}

const OLD_PAY_PLACEHOLDER = /\[(Pay now link added when the tournament is created[^\]]*)\]/g;
export const PAY_ROUTE_TEXT = "tap the Pay button on this message, or open the tournament in SquashHub";
const OLD_PAY_TEXT = /open your entry in SquashHub with the link in this message/g;
/** Swap older wording for the honest route (the in-app Pay button / the tournament's payment card). */
export const finaliseMessage = (t: string) => t.replace(OLD_PAY_PLACEHOLDER, PAY_ROUTE_TEXT).replace(OLD_PAY_TEXT, PAY_ROUTE_TEXT);
/** "Pay R100 now" from the message's own "Amount due: R100 …" line. */
export const payLabel = (t: string) => { const m = /Amount due:\s*(R[\d.,]+)/.exec(t); return m ? `Pay ${m[1]} now` : "Pay now"; };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type InformChannel = "in_app" | "email" | "whatsapp" | "sms";
export type DeliveryRow = { club_member_id: string; channel: string; status: string; error_message: string | null };

/** "Pay R100 entry fee" for the email button (the entry already exists — never "Enter"). */
export const emailPayLabel = (t: string) => { const m = /Amount due:\s*(R[\d.,]+)/.exec(t); return m ? `Pay ${m[1]} entry fee` : "Pay entry fee"; };

/**
 * Email body: the personal message, the per-player no-login Pay button, and a plain
 * link to the tournament (its presence stops the generic action button being added).
 */
export const EMAIL_INFORM_BODY =
  '<p>{{personal_message_html}}</p>{{email_pay_html}}' +
  '<p style="font-size:13px;margin-top:16px"><a href="{{action_url}}">View the tournament in SquashHub</a> (sign-in needed)</p>';

export function emailPayButton(url: string, label: string) {
  return `<div style="margin:20px 0"><a href="${esc(url)}" style="display:inline-block;background:#1E3A5F;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px">${esc(label)}</a></div>` +
    '<p style="font-size:12px;color:#64748b;margin:0">No SquashHub login needed — this link is only for your entry.</p>';
}

/** member id → secure entry link (/i/<token>) on the host club's address, via the existing token routine. */
export async function entryPayLinks(clubId: string, tournamentId: string): Promise<Record<string, string>> {
  const [{ data: tokens, error }, { data: club }] = await Promise.all([
    (supabase as any).rpc("ensure_tournament_invite_tokens", { p_champ_id: tournamentId }),
    supabase.from("clubs").select("subdomain").eq("id", clubId).maybeSingle(),
  ]);
  if (error) throw error;
  const sub = String((club as any)?.subdomain || "").trim();
  const base = sub ? `https://${sub}.squashhub.co.za` : "https://squashhub.co.za";
  const out: Record<string, string> = {};
  for (const r of (tokens ?? []) as Array<{ club_member_id: string; invite_token: string }>) {
    if (r.club_member_id && r.invite_token) out[r.club_member_id] = `${base}/i/${r.invite_token}`;
  }
  return out;
}

/** Player-facing route into the existing tournament payment card. */
export const payRoute = (tournamentId: string) => `/club-champs/${tournamentId}?pay=1`;

/**
 * Create one campaign (audience = the given entered players) with each player's personal message,
 * plus per-recipient in-app buttons (Pay now when they owe, Join WhatsApp group when configured), and dispatch it.
 * A resend is simply a new campaign for the chosen players — the original delivery log is kept.
 */
export async function sendInform(i: {
  clubId: string; tournamentId: string; name: string; channels: InformChannel[]; feeDue: boolean;
  messages: Array<{ memberId: string; text: string; owes?: boolean }>; existingCampaignId?: string | null;
  waUrl?: string | null; resend?: boolean;
}) {
  if (i.existingCampaignId) {
    const res = await dispatchCampaign(i.existingCampaignId);
    return { campaignId: i.existingCampaignId, result: res };
  }
  // Email can't rely on an app session: owing players get their entry's existing
  // secure link (256-bit token, same one the invitation page and no-login payment use).
  const emailPayLinks = i.feeDue && i.channels.includes("email")
    ? await entryPayLinks(i.clubId, i.tournamentId)
    : {};
  const memberVars: Record<string, Record<string, string>> = {};
  for (const m of i.messages) {
    const t = finaliseMessage(m.text);
    const owes = i.feeDue && m.owes !== false;
    const link = owes ? emailPayLinks[m.memberId] : undefined;
    memberVars[m.memberId] = {
      personal_message: t, personal_message_html: esc(t).replace(/\n/g, "<br>"),
      email_pay_html: link ? emailPayButton(link, emailPayLabel(t)) : "",
      ...(owes ? { pay_url: payRoute(i.tournamentId), pay_label: payLabel(t) } : {}),
      ...(i.waUrl ? { wa_url: i.waUrl } : {}),
    };
  }
  const subject = `You have been entered: ${i.name}`;
  const content: Record<string, { subject?: string; body?: string }> = {};
  for (const ch of i.channels) content[ch] = ch === "email"
    ? { subject, body: EMAIL_INFORM_BODY }
    : { subject, body: "{{personal_message}}" };
  const { campaignId, dispatched } = await sendComms({
    clubId: i.clubId, name: `${i.name} — entry notification${i.resend ? " (sent again)" : ""}`, channels: i.channels, content,
    action: { key: "tournament_view", label: "View my tournament entry", params: { tournament_id: i.tournamentId } } as any,
    audience: { type: "selected", memberIds: i.messages.map((m) => m.memberId) },
    memberVars, meta: { tournament_id: i.tournamentId, purpose: i.resend ? "step_beta_inform_resend" : "step_beta_inform" },
  });
  return { campaignId, result: dispatched };
}

export type DeliveryRowAt = DeliveryRow & { created_at?: string; campaign_id?: string };
export async function loadDeliveries(campaignIds: string | string[]): Promise<DeliveryRowAt[]> {
  const ids = (Array.isArray(campaignIds) ? campaignIds : [campaignIds]).filter(Boolean);
  if (!ids.length) return [];
  const { data } = await supabase.from("comms_deliveries").select("club_member_id,channel,status,error_message,created_at,campaign_id").in("campaign_id", ids);
  return (data ?? []) as DeliveryRowAt[];
}

/** Every inform campaign for this tournament (first send + resends). */
export const informCampaignIds = (l: BetaLifecycle) =>
  [l.inform?.method === "sent" ? l.inform.campaign_id : null, ...(l.inform?.resend_campaign_ids ?? [])].filter(Boolean) as string[];

/** Per recipient: reached if any channel delivered (across all sends). */
export function recipientStatus(memberIds: string[], rows: DeliveryRowAt[]) {
  return memberIds.map((id) => {
    const mine = rows.filter((r) => r.club_member_id === id);
    const reached = [...new Set(mine.filter((r) => r.status === "sent").map((r) => r.channel))];
    const problems = mine.filter((r) => r.status !== "sent").map((r) => `${r.channel}: ${r.error_message || r.status}`);
    const sends = new Set(mine.filter((r) => r.status === "sent").map((r) => r.campaign_id)).size;
    const last = mine.map((r) => r.created_at ?? "").sort().pop() || null;
    return { memberId: id, reached, problems, sends, last, state: reached.length ? "sent" as const : mine.length ? "failed" as const : "pending" as const };
  });
}

/** Recipient-picker presets. "not_informed" = never successfully reached on any channel (failed or never sent). */
export function recipientPreset(kind: "all" | "none" | "not_informed", status: ReturnType<typeof recipientStatus>): string[] {
  if (kind === "none") return [];
  if (kind === "all") return status.map((s) => s.memberId);
  return status.filter((s) => s.state !== "sent").map((s) => s.memberId);
}

/* ── Registrations & payments: source of truth is club_champs_registrations.status ── */

export type RegRow = { memberId: string; name: string; partnerName: string | null; status: string; owesCents: number; feeStatus?: string | null };
/** Charged to the member's club account: entry fee satisfied for readiness, but no money received. */
export const ON_ACCOUNT = "on_account";
const effStatus = (r: { status: string; feeStatus?: string | null }) => (r.feeStatus === ON_ACCOUNT ? ON_ACCOUNT : r.status);
const OUTSTANDING = new Set(["pending_payment", "pending_eft", "invited", "payment_failed"]);
export const isOutstanding = (status: string, feeDue: boolean) => feeDue && OUTSTANDING.has(status);
export const regLabel = (status: string, feeDue: boolean, confirmNeedsPay = false) =>
  status === ON_ACCOUNT && feeDue ? "Entered · Charged to member account" : confirmNeedsPay && feeDue && OUTSTANDING.has(status) ? (status === "pending_eft" ? "Not confirmed · EFT proof waiting" : status === "payment_failed" ? "Not confirmed · Payment failed" : "Not confirmed · Payment outstanding") : !feeDue ? "Entered · Payment not required" : status === "paid" ? "Entered · Paid" : status === "waived" ? "Entered · Fee waived" : status === "pending_eft" ? "Entered · EFT proof waiting" : status === "payment_failed" ? "Entered · Payment failed" : isOutstanding(status, feeDue) ? "Entered · Payment outstanding" : "Entered";

export async function loadRegistrations(tournamentId: string): Promise<{ rows: RegRow[]; feeCents: number }> {
  // Always recompute from current entries; first repair entries left inconsistent by an older replacement.
  await (supabase as any).rpc("step_reconcile_admin_entrants", { p_champ_id: tournamentId }).then(() => undefined, () => undefined);
  const [{ data: t }, { data: regs }] = await Promise.all([
    fromExt("club_champs").select("entry_fee_cents").eq("id", tournamentId).maybeSingle(),
    fromExt("club_champs_registrations").select("club_member_id, partner_member_id, status, fee_status").eq("champ_id", tournamentId),
  ]);
  const feeCents = Number((t as any)?.entry_fee_cents ?? 0);
  const live = ((regs ?? []) as any[]).filter((r) => !["cancelled", "withdrawn", "declined"].includes(String(r.status)));
  const ids = [...new Set(live.flatMap((r) => [r.club_member_id, r.partner_member_id]).filter(Boolean))];
  const { data: ms } = ids.length ? await supabase.from("club_members").select("id, name").in("id", ids) : { data: [] as any[] };
  const nm = new Map(((ms ?? []) as any[]).map((m) => [m.id, String(m.name ?? "").trim() || "Unnamed member"]));
  return {
    feeCents,
    rows: live.map((r) => ({
      memberId: r.club_member_id, name: nm.get(r.club_member_id) ?? "Unknown member",
      partnerName: r.partner_member_id ? nm.get(r.partner_member_id) ?? "Unknown member" : null,
      status: effStatus({ status: String(r.status), feeStatus: r.fee_status }), feeStatus: r.fee_status ?? null,
      owesCents: isOutstanding(effStatus({ status: String(r.status), feeStatus: r.fee_status }), feeCents > 0) ? feeCents : 0,
    })),
  };
}

/**
 * Hard prerequisites for finalising (empty = ready). The existing tournament engine has no
 * "everyone must have paid" rule before the draw, so unpaid entries are a WARNING (see
 * paymentWarning), never a block — matching the Current Builder.
 */
export function finalisePrereqs(rows: RegRow[], feeDue: boolean, confirmNeedsPay = false): string[] {
  if (!rows.length) return ["No entries yet"];
  const owing = confirmNeedsPay ? rows.filter((r) => isOutstanding(r.status, feeDue)) : [];
  return owing.length ? [`${owing.length} entr${owing.length === 1 ? "y is" : "ies are"} not confirmed until paid ("Must the fee be paid before the entry is confirmed?" = Yes)`] : [];
}
/** Read the tournament's existing payment timing: on_entry = payment confirms the entry. */
export async function loadConfirmNeedsPay(tournamentId: string): Promise<boolean> {
  const { data } = await fromExt("club_champs").select("payment_timing").eq("id", tournamentId).maybeSingle();
  return ((data as any)?.payment_timing ?? "on_entry") !== "after_acceptance";
}
export function paymentWarning(rows: RegRow[], feeDue: boolean): string | null {
  const owing = rows.filter((r) => isOutstanding(r.status, feeDue));
  if (!owing.length) return null;
  const cents = owing.reduce((s, r) => s + r.owesCents, 0);
  return `${owing.length} payment${owing.length === 1 ? "" : "s"} outstanding (R${(cents / 100).toFixed(cents % 100 ? 2 : 0)})`;
}
