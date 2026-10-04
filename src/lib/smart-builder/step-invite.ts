/**
 * Step-by-Step Beta — INVITE mode: who gets the invitation, and the send.
 *
 * Audience resolution itself lives in `src/lib/tournaments/invite-audience.ts`
 * (tested, fail-closed). This module adds:
 *   - personalising the organiser's invite message per recipient,
 *   - materialising answerable registration rows (mirrors the legacy
 *     `sendChampInvites` rules: upsert new invitees, reopen declined, never
 *     touch confirmed/paid entries),
 *   - sending through the Communications engine (comms_campaigns →
 *     send-comms-campaign → per-recipient comms_deliveries).
 */
import { fromExt } from "@/lib/supabase-ext";
import { sendComms } from "@/lib/comms/send";
import type { InviteAudienceMode } from "@/lib/tournaments/invite-audience";
import { entryPayLinks, finaliseMessage, type InformChannel } from "./step-handover";

/** The organiser's audience choice, persisted on beta_lifecycle.invite.audience. */
export type StepInviteAudience = {
  mode: InviteAudienceMode;
  leagueIds: string[];
  clubIds: string[];
  individualIds: string[];
};

export const EMPTY_INVITE_AUDIENCE: StepInviteAudience = {
  mode: "all_club",
  leagueIds: [],
  clubIds: [],
  individualIds: [],
};

const HI_LINE = /^Hi\s+[^,\n]+,/m;
const ENTRY_LINK_PLACEHOLDER = /\[entry link added when the tournament is created\]/g;

/**
 * Personalise the shared invite message for one recipient: swap the sample
 * greeting for their first name and drop in their personal entry link.
 */
export function personaliseInvite(template: string, name: string, entryLink?: string | null): string {
  const first = String(name || "").trim().split(/\s+/)[0] || "there";
  let out = String(template || "");
  out = HI_LINE.test(out) ? out.replace(HI_LINE, `Hi ${first},`) : `Hi ${first},\n\n${out}`;
  const linkText = entryLink || "open the tournament in SquashHub (you may need to sign in)";
  out = out.replace(ENTRY_LINK_PLACEHOLDER, linkText);
  return finaliseMessage(out);
}

/** Gender filter identical to the legacy builder's memberMatchesTournamentGender. */
export function memberMatchesTournamentGender(memberGender: string | null | undefined, tournamentGender: string | null | undefined): boolean {
  const g = String(tournamentGender || "").toLowerCase();
  if (!g || g === "mixed" || g === "open") return true;
  const normalized = String(memberGender || "").toLowerCase();
  const matchValues = g === "men" ? ["men", "male", "m"] : ["ladies", "female", "f", "women"];
  return matchValues.includes(normalized);
}

export type ExistingInviteRow = {
  club_member_id: string;
  status?: string | null;
  confirmed_at?: string | null;
  paid_at?: string | null;
  fee_paid_cents?: number | null;
};

export type InviteRowPlan = {
  /** No row yet → insert as invited / pending_payment. */
  insert: string[];
  /** Declined before → reopen so the re-invite is answerable. */
  reopen: string[];
  /** Auto-entered but never answered → make the invite answerable. */
  reopenUnanswered: string[];
  /** Already invited / registered / paid — left exactly as they are. */
  skip: string[];
};

/**
 * Decide what a send must do to each audience member's registration row.
 * Pure and fail-closed: only the given memberIds are ever touched.
 */
export function planInviteRows(input: {
  memberIds: string[];
  existing: ExistingInviteRow[];
  feeCents: number;
  /** true = fee must be paid before the entry is confirmed (payment_timing on_entry). */
  paymentRequired: boolean;
}): InviteRowPlan {
  const ids = Array.from(new Set((input.memberIds || []).filter(Boolean)));
  const byMember = new Map(input.existing.map((r) => [r.club_member_id, r]));
  const plan: InviteRowPlan = { insert: [], reopen: [], reopenUnanswered: [], skip: [] };
  for (const id of ids) {
    const row = byMember.get(id);
    if (!row) { plan.insert.push(id); continue; }
    const status = String(row.status || "").toLowerCase();
    if (status === "cancelled" || status === "declined") { plan.reopen.push(id); continue; }
    const unanswered = !row.confirmed_at && !row.paid_at && !Number(row.fee_paid_cents ?? 0);
    if ((status === "paid" || status === "waived") && unanswered) { plan.reopenUnanswered.push(id); continue; }
    plan.skip.push(id);
  }
  return plan;
}

/** Status a fresh / reopened invite row gets. */
export const inviteRowStatus = (feeCents: number, paymentRequired: boolean) =>
  feeCents > 0 && paymentRequired ? "pending_payment" : "invited";

/**
 * Materialise the audience's registration rows, then send each invitee their
 * personal message (with their own entry link) through the Comms engine.
 * Returns the campaign id and the per-member row plan that was applied.
 */
export async function sendInvites(i: {
  clubId: string;
  tournamentId: string;
  name: string;
  channels: InformChannel[];
  feeCents: number;
  paymentRequired: boolean;
  template: string;
  /** memberId → display name (for the greeting). */
  recipients: Array<{ memberId: string; name: string }>;
  resend?: boolean;
}): Promise<{ campaignId: string; plan: InviteRowPlan }> {
  const memberIds = i.recipients.map((r) => r.memberId);
  if (memberIds.length === 0) throw new Error("No invitees selected — nothing was sent.");

  const { data: existing, error: exErr } = await fromExt("club_champs_registrations")
    .select("club_member_id, status, confirmed_at, paid_at, fee_paid_cents")
    .eq("champ_id", i.tournamentId)
    .in("club_member_id", memberIds);
  if (exErr) throw exErr;

  const plan = planInviteRows({
    memberIds,
    existing: (existing ?? []) as ExistingInviteRow[],
    feeCents: i.feeCents,
    paymentRequired: i.paymentRequired,
  });
  const status = inviteRowStatus(i.feeCents, i.paymentRequired);

  if (plan.insert.length) {
    const { error } = await fromExt("club_champs_registrations").upsert(
      plan.insert.map((memberId) => ({
        champ_id: i.tournamentId,
        club_member_id: memberId,
        status,
        invited_by_admin: true,
        fee_paid_cents: 0,
      })),
      { onConflict: "champ_id,club_member_id", ignoreDuplicates: true } as any,
    );
    if (error) throw error;
  }
  if (plan.reopen.length) {
    const { error } = await fromExt("club_champs_registrations")
      .update({ status, declined_at: null, confirmed_at: null, confirmed_by: null, confirmation_source: null })
      .eq("champ_id", i.tournamentId)
      .in("club_member_id", plan.reopen)
      .in("status", ["cancelled", "declined"]);
    if (error) throw error;
  }
  if (plan.reopenUnanswered.length) {
    const { error } = await fromExt("club_champs_registrations")
      .update({ status })
      .eq("champ_id", i.tournamentId)
      .in("club_member_id", plan.reopenUnanswered)
      .is("confirmed_at", null)
      .is("paid_at", null)
      .eq("fee_paid_cents", 0)
      .in("status", ["paid", "waived"]);
    if (error) throw error;
  }

  // Personal entry links (same secure tokens the legacy invite page uses).
  const links = await entryPayLinks(i.clubId, i.tournamentId);
  const memberVars: Record<string, Record<string, string>> = {};
  for (const r of i.recipients) {
    const text = personaliseInvite(i.template, r.name, links[r.memberId]);
    memberVars[r.memberId] = {
      personal_message: text,
      personal_message_html: text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>"),
    };
  }
  const subject = `You're invited: ${i.name}`;
  const content: Record<string, { subject?: string; body?: string }> = {};
  for (const ch of i.channels) {
    content[ch] = ch === "email"
      ? { subject, body: '<p>{{personal_message_html}}</p>' }
      : { subject, body: "{{personal_message}}" };
  }
  const { campaignId } = await sendComms({
    clubId: i.clubId,
    name: `${i.name} — invitation${i.resend ? " (sent again)" : ""}`,
    channels: i.channels,
    content,
    action: { key: "tournament_view", label: "View tournament & enter", params: { tournament_id: i.tournamentId } } as any,
    audience: { type: "selected", memberIds },
    memberVars,
    meta: { tournament_id: i.tournamentId, purpose: i.resend ? "step_beta_invite_resend" : "step_beta_invite" },
  });
  return { campaignId, plan };
}
