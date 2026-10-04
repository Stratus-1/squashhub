import { describe, it, expect } from "vitest";
import { summariseUnlinkedAudience, isUnlinkedEligible } from "@/lib/comms/onboarding-audience";
import { activationState } from "@/components/club-admin/MemberActivationPanel";

const roster = [
  { id: "a", user_id: "u1", status: "active", email: "a@x.co" },
  { id: "b", user_id: null, status: "active", email: "b@x.co" },
  { id: "c", user_id: null, status: "active", email: "" },
  { id: "d", user_id: null, status: "resigned", email: "d@x.co" },
  { id: "e", user_id: null, status: "active", email: " E@X.CO " },
];
describe("unlinked onboarding audience", () => {
  it("mixed roster selects only unlinked active members with counts", () => {
    const s = summariseUnlinkedAudience(roster, true);
    expect(s.included.map((m) => m.id)).toEqual(["b", "e"]);
    expect([s.linked, s.noEmail, s.inactive]).toEqual([1, 1, 1]);
  });
  it("non-email channels keep members without email", () => {
    expect(summariseUnlinkedAudience(roster, false).included.map((m) => m.id)).toEqual(["b", "c", "e"]);
  });
  it("a member linking after preview is excluded on recompute", () => {
    const later = roster.map((m) => (m.id === "b" ? { ...m, user_id: "u2" } : m));
    expect(summariseUnlinkedAudience(later, true).included.map((m) => m.id)).toEqual(["e"]);
    expect(isUnlinkedEligible(later[1])).toBe(false);
  });
  it("previously-sent invites do not affect eligibility; states are labelled", () => {
    expect(isUnlinkedEligible(roster[1])).toBe(true);
    const base = { club_member_id: "b", created_at: "2026-01-01", expires_at: "2099-01-01", used_at: null, revoked_at: null };
    expect(activationState(undefined)).toBe("never sent");
    expect(activationState(base)).toBe("open");
    expect(activationState({ ...base, expires_at: "2000-01-01" })).toBe("expired");
    expect(activationState({ ...base, used_at: "x" })).toBe("used");
  });
});
