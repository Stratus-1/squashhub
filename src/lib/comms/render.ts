/**
 * Pure rendering helpers shared by the campaign preview (client) and the
 * dispatcher edge function (mirrored in
 * `supabase/functions/_shared/comms-render.ts`) so what admins preview is
 * exactly what gets delivered.
 */
import type { CommsChannel, ResolvedAction } from "./actions";
import type { MergeVars } from "./merge-fields";

export function renderMerge(template: string, vars: MergeVars): string {
  return String(template ?? "").replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_m, k) =>
    vars[k] != null ? String(vars[k]) : "",
  );
}

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function htmlToPlainText(html: string): string {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h\d|br|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Email call-to-action button markup. */
export function actionButtonHtml(action: ResolvedAction): string {
  if (!action.hasAction || !action.webUrl) return "";
  return (
    `<div style="margin:22px 0"><a href="${escapeHtml(action.webUrl)}" ` +
    `style="display:inline-block;background:#1E3A5F;color:#ffffff;text-decoration:none;` +
    `padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px">` +
    `${escapeHtml(action.label || "Open")}</a></div>`
  );
}

export type RenderedMessage = {
  channel: CommsChannel;
  subject: string;
  body: string;
  /** Plain-text alternative (email) — same as body for WhatsApp/in-app. */
  text: string;
  /** In-app deep link / web link for this channel. */
  url: string;
};

export type ChannelVersion = { subject?: string | null; body?: string | null };

/**
 * Render one channel version with merge vars + the resolved action.
 * Channel-specific handling of the same logical action:
 *   email    -> branded button
 *   whatsapp -> URL appended on its own line
 *   in_app   -> in-app route stored on the notification
 */
export function renderChannel(
  channel: CommsChannel,
  version: ChannelVersion,
  vars: MergeVars,
  action: ResolvedAction,
): RenderedMessage {
  const mergedVars: MergeVars = {
    ...vars,
    action_label: action.label || vars.action_label || "",
    action_url: action.webUrl || vars.action_url || "",
  };
  const subject = renderMerge(version.subject || "", mergedVars);
  const rawBody = renderMerge(version.body || "", mergedVars);
  const alreadyHasUrl = action.webUrl ? rawBody.includes(action.webUrl) : true;

  if (channel === "email") {
    const body = alreadyHasUrl ? rawBody : `${rawBody}${actionButtonHtml(action)}`;
    return { channel, subject, body, text: htmlToPlainText(body), url: action.webUrl };
  }

  if (channel === "whatsapp" || channel === "sms") {
    const plain = htmlToPlainText(rawBody);
    const withAction =
      action.hasAction && action.webUrl && !alreadyHasUrl
        ? `${plain}\n\n${action.label ? `${action.label}: ` : ""}${action.webUrl}`
        : plain;
    return { channel, subject, body: withAction, text: withAction, url: action.webUrl };
  }

  // in_app — no URL text in the body; the notification itself carries the route.
  const plain = htmlToPlainText(rawBody);
  return {
    channel,
    subject: subject || "Message from your club",
    body: plain,
    text: plain,
    url: action.appPath || action.webUrl,
  };
}
