export type NotificationNavigationInput = {
  id: string;
  type?: string | null;
  url?: string | null;
  title?: string | null;
  message?: string | null;
  data?: Record<string, unknown> | null;
};

export function isOneTimeFeatureUpdate(notification: NotificationNavigationInput): boolean {
  return notification.type === "platform_update" && notification.data?.once_up_notice === true;
}

const LEGACY_NOTIFICATION_ROUTES: Record<string, string> = {
  "/admin/ai-assistance": "/admin/support?view=ai",
};

/**
 * Older notices stored full links (https://uit.squashhub.co.za/i/…). The app's
 * in-page navigation treats those as a path and showed "Page not found", so
 * SquashHub links are reduced to their path; other sites stay untouched.
 */
function toAppPath(url: string) {
  if (!/^https?:\/\//i.test(url)) return url;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const ownHost = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
    const isSquashHub =
      host === ownHost ||
      host === "squashhub.co.za" ||
      host.endsWith(".squashhub.co.za") ||
      host.endsWith(".lovable.app");
    return isSquashHub ? `${u.pathname}${u.search}${u.hash}` || "/" : url;
  } catch {
    return url;
  }
}

export function resolveNotificationUrl(url?: string | null) {
  const resolvedUrl = toAppPath(String(url || "/notifications"));
  return LEGACY_NOTIFICATION_ROUTES[resolvedUrl] || resolvedUrl;
}

function getRsvpStatus(notification: NotificationNavigationInput) {
  const value = notification.data && typeof notification.data === "object" ? notification.data.rsvp_status : null;
  return typeof value === "string" ? value.toLowerCase() : "";
}

function isPendingEventNotification(notification: NotificationNavigationInput) {
  const resolvedUrl = resolveNotificationUrl(notification.url);
  if (!resolvedUrl.startsWith("/events")) return false;

  const rsvpStatus = getRsvpStatus(notification);
  if (["confirmed", "declined", "cancelled"].includes(rsvpStatus)) return false;
  if (["invited", "pending", "requested", "unconfirmed"].includes(rsvpStatus)) return true;

  const searchableText = `${notification.title || ""} ${notification.message || ""}`.toLowerCase();
  return searchableText.includes("you're invited") || searchableText.includes("please confirm or decline");
}

export function getNotificationNavigation(notification: NotificationNavigationInput) {
  const resolvedUrl = resolveNotificationUrl(notification.url);
  const pendingEvent = isPendingEventNotification(notification);
  const pendingTournamentInvite = notification.type === "tournament_invite" || notification.type === "tournament_partner_invite";
  const shouldOpenDetail = notification.type === "marketing" || pendingTournamentInvite || resolvedUrl.startsWith("/notifications") || pendingEvent;

  return {
    canNavigate: !pendingEvent && !pendingTournamentInvite && !resolvedUrl.startsWith("/notifications"),
    shouldOpenDetail,
    targetUrl: shouldOpenDetail ? `/notifications?notificationId=${notification.id}` : resolvedUrl,
  };
}
