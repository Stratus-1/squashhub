import { describe, it, expect } from "vitest";
import { partnerPayChoices } from "@/components/tournaments/PartnerFeeOptions";

describe("partnerPayChoices", () => {
  const base = { ok: true, enabled: true, partner_name: "Dewald van Wyk", fee_cents: 10000 };
  it("offers partner + both when both owe", () => expect(partnerPayChoices({ ...base, partner_owes: true, me_owes: true })).toEqual(["partner", "both"]));
  it("offers partner only when my fee is settled", () => expect(partnerPayChoices({ ...base, partner_owes: true, me_owes: false })).toEqual(["partner"]));
  it("offers nothing when the partner has settled", () => expect(partnerPayChoices({ ...base, partner_owes: false, me_owes: true })).toEqual([]));
  it("offers nothing when the tournament doesn't allow it", () => expect(partnerPayChoices({ ...base, enabled: false, partner_owes: true, me_owes: true })).toEqual([]));
  it("offers nothing without options", () => expect(partnerPayChoices(null)).toEqual([]));
});

import { inviteState } from "@/lib/tournaments/invite-link";
describe("settled-elsewhere recognition", () => {
  it("offers nothing for a partner already settled on account", () => {
    expect(partnerPayChoices({ ok: true, enabled: true, partner_owes: false, me_owes: true, fee_cents: 10000, partner_settled_via: "account" })).toEqual([]);
  });
  it("secure link treats a member-account settled entry as entered, not payment pending", () => {
    const base = { found: true, status: "pending_payment", confirmed_at: "2026-10-01" } as any;
    expect(inviteState(base)).toBe("payment_pending");
    expect(inviteState({ ...base, fee_settled_via: "account", fee_status: "on_account" })).toBe("registered");
    expect(inviteState({ ...base, fee_status: "paid" })).toBe("registered");
    expect(inviteState({ ...base, fee_status: "due" })).toBe("payment_pending");
  });
});
