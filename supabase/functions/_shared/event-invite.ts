/** Only social-event invitation messages receive public RSVP capability links. */
export function eventInvitationTarget(type: string, url: string, data?: Record<string, unknown> | null) {
  if (!["event", "event_invite", "event_reminder"].includes(type) && data?.kind !== "event_instance_reminder" && !(type === "booking" && data?.event_id)) return null;
  const match = /^\/events\/([0-9a-f-]{36})(?:\?([^#]*))?$/i.exec(url);
  const eventId = String(data?.event_id || match?.[1] || "");
  const instanceId = String(data?.instance_id || new URLSearchParams(match?.[2] || "").get("instance") || "");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(eventId) || (instanceId && !uuid.test(instanceId))) return null;
  return { eventId, instanceId: instanceId || null };
}

export function eventInvitationUrl(subdomain: string | null, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid invitation token");
  if (subdomain && !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(subdomain)) throw new Error("Invalid club website");
  return `https://${subdomain ? `${subdomain}.` : ""}squashhub.co.za/event-invite/${token}`;
}