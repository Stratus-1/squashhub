import { describe, it, expect } from "vitest";
import { pairPayerChoices } from "@/lib/tournaments/doubles";
const base = { id: "p", group_number: 3, status: "awaiting_payment", proposed_by_me: false, partner_member_id: "x", partner_name: "R", partner_club: null } as any;
describe("either doubles partner can pay", () => {
  it("covered partner may pay her own fee", () => {
    expect(pairPayerChoices({ ...base, covered_by_partner: true, pays_for_partner: true }, false, 21000)).toEqual(["self", "both"]);
  });
  it("payer covering both may switch to own fee only", () => {
    expect(pairPayerChoices({ ...base, payer_is_me: true, pays_for_partner: true }, false, 21000)).toEqual(["self"]);
  });
  it("each-pays-own pair lets either player pay both", () => {
    expect(pairPayerChoices({ ...base, pays_for_partner: false }, false, 21000)).toEqual(["both"]);
  });
  it("no choice once the partner paid or pairs locked", () => {
    expect(pairPayerChoices({ ...base, pays_for_partner: false, partner_fee_paid: true }, false, 21000)).toEqual([]);
    expect(pairPayerChoices({ ...base, pays_for_partner: false }, true, 21000)).toEqual([]);
  });
});
