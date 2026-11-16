import { describe, it, expect } from "vitest";
import { isEnteredRegistration } from "@/lib/smart-builder/step-handover";

describe("isEnteredRegistration — an invitation is not an entry", () => {
  it("invite-only row (not confirmed, no organiser source) is not entered and owes nothing", () => {
    expect(isEnteredRegistration({ status: "pending_payment", registration_status: "invited", registration_source: null, confirmed_at: null, fee_status: "due" })).toBe(false);
  });
  it("player who confirmed via the invite counts as entered even before paying", () => {
    expect(isEnteredRegistration({ status: "pending_payment", registration_status: "invited", registration_source: "organiser", confirmed_at: "2026-11-16T09:55:48Z", fee_status: "due" })).toBe(true);
  });
  it("organiser-entered player counts as entered", () => {
    expect(isEnteredRegistration({ status: "pending_payment", registration_status: "invited", registration_source: "organiser", confirmed_at: null })).toBe(true);
  });
  it("paid entry counts as entered", () => {
    expect(isEnteredRegistration({ status: "paid", registration_status: "registered", confirmed_at: null })).toBe(true);
  });
  it("cancelled entry is not entered", () => {
    expect(isEnteredRegistration({ status: "cancelled", registration_status: "declined", confirmed_at: "2026-11-16T08:02:39Z" })).toBe(false);
  });
});
