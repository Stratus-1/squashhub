import { describe, expect, it } from "vitest";
import { testRecipient } from "../../supabase/functions/agm-test-email/policy";

describe("AGM single-recipient test emails", () => {
  it("sends a member preview only to the signed-in admin when self is selected", () => {
    expect(testRecipient("self", "admin@example.com", { email: "member@example.com" })).toBe("admin@example.com");
  });
  it("sends only to the selected member when member is selected", () => {
    expect(testRecipient("member", "admin@example.com", { email: "member@example.com" })).toBe("member@example.com");
  });
  it("does not fall back to another recipient when the member has no email", () => {
    expect(() => testRecipient("member", "admin@example.com", { email: null })).toThrow("no valid email");
  });
});