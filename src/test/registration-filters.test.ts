import { describe, expect, it } from "vitest";
import { matchesRegistrationFilter, partnersOf } from "@/lib/tournaments/registration-filters";

const ctx = { feeRequired: true };
const reg = (extra: any) => ({ club_member_id: "m", status: "registered", registration_status: "registered", fee_status: "due", ...extra });

describe("Registrations quick filters", () => {
  it("Paid shows only entries whose fee is paid", () => {
    expect(matchesRegistrationFilter(reg({ fee_status: "paid" }), "paid", ctx)).toBe(true);
    expect(matchesRegistrationFilter(reg({ fee_status: "due" }), "paid", ctx)).toBe(false);
    expect(matchesRegistrationFilter(reg({ fee_status: "waived" }), "paid", ctx)).toBe(false);
  });
  it("Registered includes entered players even with fee still due, never invited-only", () => {
    expect(matchesRegistrationFilter(reg({}), "registered", ctx)).toBe(true);
    expect(matchesRegistrationFilter(reg({ status: "invited", registration_status: "invited" }), "registered", ctx)).toBe(false);
  });
  it("Not entered yet lists invited players but not cancelled ones", () => {
    expect(matchesRegistrationFilter(reg({ status: "invited", registration_status: "invited" }), "not_entered", ctx)).toBe(true);
    expect(matchesRegistrationFilter(reg({ status: "cancelled", registration_status: "declined" }), "not_entered", ctx)).toBe(false);
  });
});

describe("Doubles partners", () => {
  it("lists one partner per category from the pairing board, skipping cancelled pairs", () => {
    const pairs = [
      { member_a: "m", member_b: "p1", group_number: 3, status: "confirmed", b: { name: "Neill" } },
      { member_a: "p2", member_b: "m", group_number: 1, status: "awaiting_payment", a: { name: "Jan" } },
      { member_a: "m", member_b: "p3", group_number: 2, status: "cancelled" },
    ];
    const out = partnersOf("m", pairs);
    expect(out.map((p) => [p.group, p.name, p.confirmed])).toEqual([[1, "Jan", false], [3, "Neill", true]]);
  });
  it("falls back to the registration partner when the board has no row for them", () => {
    expect(partnersOf("m", [], { id: "p9", name: "Sam", confirmed: true })).toEqual([
      { partnerId: "p9", name: "Sam", group: null, confirmed: true, status: "confirmed" },
    ]);
  });
});
