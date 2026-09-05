// Server mirror of src/lib/comms/{actions,render}.ts — keep in sync.
// deno-lint-ignore-file no-explicit-any

export type CommsChannel = "email" | "whatsapp" | "sms" | "in_app";

export type CommsAction = {
  key?: string;
  label?: string | null;
  params?: Record<string, string | undefined>;
};

export type ResolvedAction = {
  key: string;
  label: string;
  appPath: string;
  webUrl: string;
  hasAction: boolean;
};

const ACTIONS: Record<string, { defaultLabel: string; path: (p: any) => string; external?: boolean }> = {
  profile: { defaultLabel: "Open my profile", path: () => "/profile" },
  profile_skills: { defaultLabel: "Update my skills & expertise", path: () => "/profile#skills" },
  my_account: { defaultLabel: "View my account", path: () => "/my-account" },
  bookings: { defaultLabel: "Book a court", path: () => "/bookings" },
  events: { defaultLabel: "See club events", path: () => "/events" },
  event_detail: { defaultLabel: "View the event", path: (p) => `/events/${p.event_id ?? ""}` },
  tournaments: { defaultLabel: "View tournaments", path: () => "/tournaments" },
  tournament_entry: { defaultLabel: "Enter the tournament", path: (p) => `/tournaments?tournamentId=${p.tournament_id ?? ""}` },
  league_games: { defaultLabel: "View my fixtures", path: () => "/league-games" },
  availability: { defaultLabel: "Set my availability", path: () => "/availability" },
  ladder: { defaultLabel: "View the ladder", path: () => "/ladder" },
  notifications: { defaultLabel: "Open notifications", path: () => "/notifications" },
  club_landing: { defaultLabel: "Visit our club page", path: () => "/" },
  external: { defaultLabel: "Open link", path: (p) => String(p.url ?? ""), external: true },
};

export function clubWebBase(subdomain?: string | null): string {
  const sub = String(subdomain || "").trim();
  return sub ? `https://${sub}.squashhub.co.za` : "https://squashhub.co.za";
}

export function resolveAction(action: CommsAction | null | undefined, clubSubdomain?: string | null): ResolvedAction {
  const key = action?.key || "none";
  const def = ACTIONS[key];
  if (!def) return { key: "none", label: "", appPath: "", webUrl: "", hasAction: false };
  const params = action?.params ?? {};
  const label = (action?.label || "").trim() || def.defaultLabel;
  if (def.external) {
    const url = String(params.url || "").trim();
    return { key, label, appPath: "", webUrl: url, hasAction: !!url };
  }
  const path = def.path(params);
  const webUrl = `${clubWebBase(clubSubdomain)}${path === "/" ? "" : path}`;
  return { key, label, appPath: path, webUrl, hasAction: true };
}

export function renderMerge(template: string, vars: Record<string, string>): string {
  return String(template ?? "").replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_m, k) =>
    vars[k] != null ? String(vars[k]) : "",
  );
}

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function htmlToPlainText(html: string): string {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h\d|br|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
}

export function actionButtonHtml(action: ResolvedAction): string {
  if (!action.hasAction || !action.webUrl) return "";
  return `<div style="margin:22px 0"><a href="${escapeHtml(action.webUrl)}" style="display:inline-block;background:#1E3A5F;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px">${escapeHtml(action.label || "Open")}</a></div>`;
}

export function renderChannel(
  channel: CommsChannel,
  version: { subject?: string | null; body?: string | null },
  vars: Record<string, string>,
  action: ResolvedAction,
) {
  const mergedVars = {
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
    const withAction = action.hasAction && action.webUrl && !alreadyHasUrl
      ? `${plain}\n\n${action.label ? `${action.label}: ` : ""}${action.webUrl}`
      : plain;
    return { channel, subject, body: withAction, text: withAction, url: action.webUrl };
  }
  const plain = htmlToPlainText(rawBody);
  return {
    channel,
    subject: subject || "Message from your club",
    body: plain,
    text: plain,
    url: action.appPath || action.webUrl,
  };
}
