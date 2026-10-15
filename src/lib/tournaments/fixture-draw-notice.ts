/**
 * Per-fixture draw notices. Server state on club_champs_matches.draw_notice_state:
 *   pending (Prompt mode, awaiting organiser) · auto (Automatic, sending) · dismissed ("Later", still sendable)
 *   correction (players changed after a notice went out) · sent · off · NULL (pre-feature / not confirmed).
 * A fixture only gets a state once BOTH players are known (DB trigger), so positional placeholders never notify.
 */
import { supabase } from "@/integrations/supabase/client";
import { sendMemberMessage } from "@/lib/messaging";

export type OpenFixtureNotice = { id: string; state: "pending" | "dismissed" | "correction"; round: number | null; group: number | null; label: string; a: string; b: string; when: string };

export const isOpenNoticeState = (s: string | null | undefined): s is OpenFixtureNotice["state"] => s === "pending" || s === "dismissed" || s === "correction";

/** Prompt shows NEW (pending) and corrections; dismissed ones stay listed under "not yet sent". */
export function splitOpenNotices(list: OpenFixtureNotice[]) {
  return { fresh: list.filter((n) => n.state !== "dismissed"), later: list.filter((n) => n.state === "dismissed") };
}

export async function loadOpenFixtureNotices(champId: string): Promise<{ open: OpenFixtureNotice[]; waQueued: number }> {
  const { data, error } = await (supabase as any).from("club_champs_matches")
    .select("id, draw_notice_state, draw_notice_wa_pending, round_number, group_number, stage_label, scheduled_date, scheduled_time, play_by, a:club_members!club_champs_matches_player_a_member_id_fkey(name), b:club_members!club_champs_matches_player_b_member_id_fkey(name)")
    .eq("champ_id", champId).or("draw_notice_state.in.(pending,dismissed,correction),draw_notice_wa_pending.eq.true");
  if (error) throw error;
  const rows = (data ?? []) as any[];
  return {
    waQueued: rows.filter((r) => r.draw_notice_wa_pending).length,
    open: rows.filter((r) => isOpenNoticeState(r.draw_notice_state)).map((r) => ({
      id: r.id, state: r.draw_notice_state, round: r.round_number, group: r.group_number,
      label: r.stage_label || (r.round_number ? `Round ${r.round_number}` : "Match"),
      a: r.a?.name ?? "Player", b: r.b?.name ?? "Player",
      when: r.scheduled_date ? `${r.scheduled_date}${r.scheduled_time ? ` ${String(r.scheduled_time).slice(0, 5)}` : ""}` : r.play_by ? `Play by ${r.play_by}` : "Not scheduled",
    })),
  };
}

async function dispatchWhatsApp(clubId: string, list: Array<{ member_id: string; message: string; sms?: string }>) {
  let ok = 0;
  for (const w of list) {
    try {
      const r = await sendMemberMessage({ clubId, recipients: [{ member_id: w.member_id }], text: w.message, smsText: w.sms, replyRequired: false, kind: "champ_round_draw" });
      if (r.sent > 0) ok += 1;
    } catch { /* counted as not sent */ }
  }
  return ok;
}

/** Organiser approval: sends once per fixture through the tournament's enabled channels. */
export async function sendFixtureNotices(clubId: string, champId: string, ids: string[] | null) {
  const { data, error } = await (supabase as any).rpc("send_champ_fixture_draw_notices", { p_champ_id: champId, p_match_ids: ids });
  if (error) throw error;
  const wa = Array.isArray(data?.whatsapp) ? data.whatsapp : [];
  const waSent = wa.length ? await dispatchWhatsApp(clubId, wa) : 0;
  return { sent: Number(data?.sent ?? 0), waSent };
}

export async function dismissFixtureNotices(champId: string, ids: string[]) {
  const { error } = await (supabase as any).rpc("dismiss_champ_fixture_draw_notices", { p_champ_id: champId, p_match_ids: ids });
  if (error) throw error;
}

/** Automatic mode: in-app/email already went out server-side; WhatsApp/SMS needs an admin session to dispatch. */
export async function flushQueuedWhatsApp(clubId: string, champId: string) {
  const { data, error } = await (supabase as any).rpc("claim_champ_fixture_wa_notices", { p_champ_id: champId });
  if (error) throw error;
  const wa = Array.isArray(data?.whatsapp) ? data.whatsapp : [];
  return wa.length ? dispatchWhatsApp(clubId, wa) : 0;
}
