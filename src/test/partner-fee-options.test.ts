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
