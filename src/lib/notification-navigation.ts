export type NotificationNavigationInput = {
  id: string;
  type?: string | null;
  url?: string | null;
  title?: string | null;
  message?: string | null;
  data?: Record<string, unknown> | null;
};

const LEGACY_NOTIFICATION_ROUTES: Record<string, string> = {
  "/admin/ai-assistance": "/admin/support?view=ai",
};

export function resolveNotificationUrl(url?: string | null) {
  const resolvedUrl = String(url || "/notifications");
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
