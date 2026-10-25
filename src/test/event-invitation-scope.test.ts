import { describe, expect, it } from "vitest";
import { eventInvitationScope, isOccurrenceInvitation } from "@/lib/events/invitation-scope";

describe("weekly event invitations", () => {
  it("addresses each week's own attendance rather than a prior series answer", () => {
    expect(eventInvitationScope("oct-29")).toEqual({ table: "club_event_instance_rsvps", column: "instance_id", id: "oct-29" });
    expect(eventInvitationScope("nov-05").id).toBe("nov-05");
  });
  it("retains series replies only when no occurrence exists", () => {
    expect(eventInvitationScope().table).toBe("club_event_rsvps");
  });
  it("allows accept and decline on legacy weekly invitation reminders", () => {
    expect(isOccurrenceInvitation({ type: "reminder", data: { event_id: "social", instance_id: "oct-29", kind: "event_instance_reminder" } })).toBe(true);
    expect(isOccurrenceInvitation({ type: "reminder", data: { event_id: "social", instance_id: "oct-29", kind: "event_instance_reminder", rsvp_status: "confirmed" } })).toBe(false);
    expect(isOccurrenceInvitation({ type: "reminder", data: { event_id: "social" } })).toBe(false);
  });
});