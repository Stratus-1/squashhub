/** Attendance belongs to the addressed occurrence, never the recurring series. */
export function eventInvitationScope(instanceId?: string | null) {
  return instanceId
    ? { table: "club_event_instance_rsvps" as const, column: "instance_id" as const, id: instanceId }
    : { table: "club_event_rsvps" as const, column: "event_id" as const, id: null };
}

export function isOccurrenceInvitation(notification: { type?: string | null; data?: Record<string, unknown> | null }) {
  return !!notification.data?.event_id && !!notification.data?.instance_id &&
    notification.data?.kind === "event_instance_reminder" && !notification.data?.rsvp_status;
}