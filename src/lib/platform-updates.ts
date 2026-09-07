/**
 * Platform Updates — SquashHub → club administrators.
 *
 * Deliberately mirrors the club Communications engine (`@/lib/comms/*`) but
 * with a platform sender identity and a club-administrator audience. Message
 * rendering re-uses the same merge-token syntax so admins learn it once.
 */
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

export const PLATFORM_CHANNELS = [
  { key: "in_app", label: "In-app" },
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "sms", label: "SMS" },
] as const;

export type PlatformChannel = typeof PLATFORM_CHANNELS[number]["key"];

export const PLATFORM_MERGE_FIELDS = [
  { key: "first_name", label: "First name" },
  { key: "surname", label: "Surname" },
  { key: "name", label: "Full name" },
  { key: "club_name", label: "Club name" },
  { key: "association_name", label: "Association" },
  { key: "club_email", label: "Club email" },
  { key: "club_phone", label: "Club phone" },
  { key: "subscription_plan", label: "Subscription plan" },
  { key: "action_url", label: "Action link" },
];

export type PlatformAudienceType = "all" | "clubs" | "association" | "plan" | "admins";

/** Fill {{tokens}} for previews — the server does the same at send time. */
export function renderMerge(text: string, vars: Record<string, string>) {
  return String(text ?? "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_m, k) => vars[k] ?? "");
}

export function htmlToText(html: string) {
  return String(html ?? "")
    .replace(/<\/(p|div|h\d|br|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function dispatchPlatformCampaign(campaignId: string, failedOnly = false) {
  const { data, error } = await supabase.functions.invoke("send-platform-update", {
    body: { campaign_id: campaignId, failed_only: failedOnly },
  });
  if (error) {
    let detail = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const parsed = await error.context.json();
        detail = parsed?.error ?? detail;
      } catch { /* keep generic */ }
    }
    throw new Error(detail);
  }
  return data as { ok: boolean; status: string; sent: number; failed: number; skipped: number; clubs: number };
}

/** CSV export of a campaign's per-recipient delivery results. */
export function deliveryCsv(rows: any[]) {
  const head = ["Club", "Recipient", "Channel", "Target", "Status", "Error", "Sent at", "Read at"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    head.join(","),
    ...rows.map((r) =>
      [r.club_name, r.recipient_name, r.channel, r.target, r.status, r.error_message, r.sent_at, r.read_at]
        .map(esc).join(","),
    ),
  ].join("\n");
}
