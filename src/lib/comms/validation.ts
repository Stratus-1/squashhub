/**
 * Campaign validation — run before the admin can send.
 *
 * Enforces the core rule: only channels ticked for THIS send are used, and a
 * ticked channel must have a template version plus reachable recipients.
 */
import { type CommsAction, type CommsChannel, missingActionParams } from "./actions";

export type CommsRecipient = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  user_id?: string | null;
};

export type ChannelVersionMap = Partial<Record<CommsChannel, { subject?: string | null; body?: string | null } | null>>;

export type CommsWarning = {
  level: "error" | "warning";
  channel?: CommsChannel;
  message: string;
};

export const CHANNEL_LABEL: Record<CommsChannel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  sms: "SMS",
  in_app: "In-app",
};

export function reachableFor(channel: CommsChannel, r: CommsRecipient): boolean {
  if (channel === "email") return !!r.email && r.email.includes("@");
  if (channel === "whatsapp" || channel === "sms") return !!r.phone && String(r.phone).replace(/\D/g, "").length >= 8;
  return !!r.user_id;
}

export function countReachable(channel: CommsChannel, recipients: CommsRecipient[]): number {
  return recipients.filter((r) => reachableFor(channel, r)).length;
}

export function hasVersion(versions: ChannelVersionMap, channel: CommsChannel): boolean {
  const v = versions[channel];
  return !!v && !!String(v.body || "").replace(/<[^>]*>/g, "").trim();
}

export function validateCampaign(opts: {
  channels: CommsChannel[];
  versions: ChannelVersionMap;
  recipients: CommsRecipient[];
  action?: CommsAction | null;
}): CommsWarning[] {
  const warnings: CommsWarning[] = [];
  const { channels, versions, recipients } = opts;

  if (!channels.length) {
    warnings.push({ level: "error", message: "Pick at least one channel for this send." });
  }
  if (!recipients.length) {
    warnings.push({ level: "error", message: "No recipients selected." });
  }

  for (const ch of channels) {
    if (!hasVersion(versions, ch)) {
      warnings.push({
        level: "error",
        channel: ch,
        message: `${CHANNEL_LABEL[ch]} is selected but this template has no ${CHANNEL_LABEL[ch]} version. Add one, or untick ${CHANNEL_LABEL[ch]}.`,
      });
      continue;
    }
    if (ch === "email" && !String(versions.email?.subject || "").trim()) {
      warnings.push({ level: "error", channel: ch, message: "Email version has no subject line." });
    }
    const reachable = countReachable(ch, recipients);
    if (reachable === 0 && recipients.length) {
      warnings.push({
        level: "error",
        channel: ch,
        message: `No selected recipient can receive ${CHANNEL_LABEL[ch]} (${
          ch === "email" ? "no email addresses" : ch === "in_app" ? "no linked app accounts" : "no mobile numbers"
        }).`,
      });
    } else if (reachable < recipients.length) {
      warnings.push({
        level: "warning",
        channel: ch,
        message: `${recipients.length - reachable} of ${recipients.length} recipients will be skipped on ${CHANNEL_LABEL[ch]}.`,
      });
    }
  }

  const missing = missingActionParams(opts.action);
  if (missing.length) {
    warnings.push({ level: "error", message: `The action is missing: ${missing.join(", ")}.` });
  }

  return warnings;
}

export function canSend(warnings: CommsWarning[]): boolean {
  return !warnings.some((w) => w.level === "error");
}
