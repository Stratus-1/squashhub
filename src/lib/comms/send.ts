/**
 * Client entry point for the Communications engine.
 *
 * Any future SquashHub communication (fees, fixtures, tournaments…) should go
 * through `sendComms` rather than calling email / WhatsApp / notifications
 * directly — that way it inherits templates, actions, channel selection,
 * validation and the delivery log for free.
 */
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import type { CommsAction, CommsChannel } from "./actions";

export type CampaignContent = Partial<Record<CommsChannel, { subject?: string; body?: string }>>;

export type SendCommsOptions = {
  clubId: string;
  name: string;
  templateId?: string | null;
  channels: CommsChannel[];
  content: CampaignContent;
  action?: CommsAction | null;
  audience:
    | { type: "all" }
    | { type: "selected"; memberIds: string[] }
    | { type: "league"; leagueId: string }
    | { type: "skills"; filter: Record<string, unknown> };
  /** ISO timestamp — when set the campaign is scheduled instead of sent now. */
  scheduledFor?: string | null;
  /** Save without sending. */
  draft?: boolean;
};

async function functionError(error: unknown): Promise<string> {
  const err = error as { message?: string; context?: { json: () => Promise<any> } };
  let detail = err?.message ?? "Send failed";
  if (error instanceof FunctionsHttpError) {
    try {
      const parsed = await error.context.json();
      detail = parsed?.error ?? detail;
    } catch {
      /* keep generic */
    }
  }
  return detail;
}

/** Create (or update) a campaign row from the options above. */
export async function upsertCampaign(opts: SendCommsOptions, campaignId?: string | null) {
  const { data: { user } } = await supabase.auth.getUser();
  const row = {
    club_id: opts.clubId,
    template_id: opts.templateId ?? null,
    name: opts.name,
    channels: opts.channels,
    audience_type: opts.audience.type,
    audience_member_ids: opts.audience.type === "selected" ? opts.audience.memberIds : [],
    audience_league_id: opts.audience.type === "league" ? opts.audience.leagueId : null,
    audience_filter: opts.audience.type === "skills" ? (opts.audience.filter as any) : {},
    content: opts.content as any,
    action: (opts.action ?? { key: "none" }) as any,
    status: opts.draft ? "draft" : opts.scheduledFor ? "scheduled" : "draft",
    scheduled_for: opts.scheduledFor ?? null,
    created_by: user?.id ?? null,
  };

  if (campaignId) {
    const { data, error } = await supabase
      .from("comms_campaigns").update(row).eq("id", campaignId).select("id").single();
    if (error) throw error;
    return data.id as string;
  }
  const { data, error } = await supabase
    .from("comms_campaigns").insert(row).select("id").single();
  if (error) throw error;
  return data.id as string;
}

/** Dispatch an existing campaign immediately. */
export async function dispatchCampaign(campaignId: string) {
  const { data, error } = await supabase.functions.invoke("send-comms-campaign", {
    body: { campaign_id: campaignId },
  });
  if (error) throw new Error(await functionError(error));
  return data as { ok: boolean; status: string; sent: number; failed: number; skipped: number };
}

/**
 * One-call helper: create the campaign and send it now (or leave it scheduled
 * / drafted). Returns the campaign id.
 */
export async function sendComms(opts: SendCommsOptions) {
  const campaignId = await upsertCampaign(opts);
  if (opts.draft || opts.scheduledFor) return { campaignId, dispatched: null };
  const result = await dispatchCampaign(campaignId);
  return { campaignId, dispatched: result };
}
