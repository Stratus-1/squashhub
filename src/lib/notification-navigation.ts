export type NotificationNavigationInput = {
  id: string;
  type?: string | null;
  url?: string | null;
  title?: string | null;
  message?: string | null;
  data?: Record<string, unknown> | null;
};

function getRsvpStatus(notification: NotificationNavigationInput) {
  const value = notification.data && typeof notification.data === "object" ? notification.data.rsvp_status : null;
  return typeof value === "string" ? value.toLowerCase() : "";
}

function isPendingEventNotification(notification: NotificationNavigationInput) {
  const resolvedUrl = String(notification.url || "/notifications");
  if (!resolvedUrl.startsWith("/events")) return false;

  const rsvpStatus = getRsvpStatus(notification);
  if (["confirmed", "declined", "cancelled"].includes(rsvpStatus)) return false;
  if (["invited", "pending", "requested", "unconfirmed"].includes(rsvpStatus)) return true;

  const searchableText = `${notification.title || ""} ${notification.message || ""}`.toLowerCase();
  return searchableText.includes("you're invited") || searchableText.includes("please confirm or decline");
}

export function getNotificationNavigation(notification: NotificationNavigationInput) {
  const resolvedUrl = String(notification.url || "/notifications");
  const pendingEvent = isPendingEventNotification(notification);
  const shouldOpenDetail = notification.type === "marketing" || resolvedUrl.startsWith("/notifications") || pendingEvent;

  return {
    canNavigate: !pendingEvent && !resolvedUrl.startsWith("/notifications"),
    shouldOpenDetail,
    targetUrl: shouldOpenDetail ? `/notifications?notificationId=${notification.id}` : resolvedUrl,
  };
}
