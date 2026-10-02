export type NotificationAction = { kind: string; label: string; url: string };

/** Per-recipient buttons attached by the messaging service (Pay now, Join WhatsApp group). */
export function notificationActions(n: { data?: Record<string, any> | null } | null | undefined): NotificationAction[] {
  const raw = n?.data?.actions;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a: any) =>
      a && typeof a.url === "string" && typeof a.label === "string" &&
      (a.url.startsWith("/") || /^https:\/\/chat\.whatsapp\.com\//i.test(a.url)),
  );
}

/** Drop message lines that only repeat a button's raw link, so links are never shown as plain text. */
export function messageWithoutActionLinks(message: string, actions: NotificationAction[]): string {
  if (!actions.length) return message;
  return String(message ?? "")
    .split("\n")
    .filter((line) => !actions.some((a) => line.includes(a.url)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
