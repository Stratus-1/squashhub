import { describe, expect, it } from "vitest";
import { eventInvitationTarget, eventInvitationUrl } from "../../supabase/functions/_shared/event-invite";

const event = "00000000-0000-4000-8000-000000000001";
const instance = "00000000-0000-4000-8000-000000000002";
describe("Public social event invitation links", () => {
  it("opens CSIR's website rather than the main website", () => {
    expect(eventInvitationUrl("csir", "a".repeat(64))).toBe(`https://csir.squashhub.co.za/event-invite/${"a".repeat(64)}`);
  });
  it("retains the exact invited occurrence", () => {
    expect(eventInvitationTarget("event_reminder", `/events/${event}?instance=${instance}`)).toEqual({ eventId: event, instanceId: instance });
  });
  it("does not convert ordinary reminders or tournaments", () => {
    expect(eventInvitationTarget("reminder", `/events/${event}`)).toBeNull();
    expect(eventInvitationTarget("tournament_invite", `/events/${event}`)).toBeNull();
  });
  it("rejects untrusted host names and malformed tokens", () => {
    expect(() => eventInvitationUrl("csir.evil.test", "a".repeat(64))).toThrow();
    expect(() => eventInvitationUrl("csir", "member-id")).toThrow();
  });
});