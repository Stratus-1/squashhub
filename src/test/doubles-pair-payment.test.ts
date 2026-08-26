import { describe, it, expect } from "vitest";
import {
  pairAction,
  pairForDivision,
  pairPaymentLabel,
  pairStatusLabel,
  type MyPair,
} from "@/lib/tournaments/doubles";

const base: MyPair = {
  id: "p1",
  group_number: 1,
  status: "pending",
  proposed_by_me: true,
  partner_member_id: "m2",
  partner_name: "Sam",
  partner_club: null,
};

const money = (r: number) => `R${r.toFixed(2)}`;

describe("doubles pair payment states", () => {
  it("treats awaiting_payment as an active pair and prefers confirmed", () => {
    const pairs: MyPair[] = [
      { ...base, id: "a", status: "awaiting_payment" },
      { ...base, id: "b", status: "confirmed" },
    ];
    expect(pairForDivision(pairs, 1)?.id).toBe("b");
    expect(pairForDivision([pairs[0]], 1)?.id).toBe("a");
  });

  it("keeps the pair unlocked while a fee is outstanding", () => {
    expect(pairAction({ ...base, status: "awaiting_payment" }, false)).toBe("awaiting_payment");
    expect(pairAction({ ...base, status: "confirmed" }, false)).toBe("confirmed");
    expect(pairAction(null, false)).toBe("choose");
  });

  it("labels who still owes what", () => {
    const p = { ...base, status: "awaiting_payment" as const, my_fee_paid: false, partner_fee_paid: true };
    expect(pairPaymentLabel(p, 15000, money)).toBe("Your R150.00 entry fee is still to pay.");
    expect(pairPaymentLabel({ ...p, covered_by_partner: true }, 15000, money)).toBe(
      "Sam is paying your R150.00 entry fee.",
    );
    expect(
      pairPaymentLabel({ ...p, payer_is_me: true, pays_for_partner: true, partner_fee_paid: false }, 15000, money),
    ).toBe("You chose to pay for both entries — R300.00 due.");
    expect(pairPaymentLabel({ ...p, my_fee_paid: true }, 15000, money)).toBe("Both entry fees are paid.");
  });

  it("says nothing about money for free tournaments", () => {
    expect(pairPaymentLabel({ ...base }, 0, money)).toBeNull();
  });

  it("reflects the lock in the status line", () => {
    expect(pairStatusLabel({ ...base, status: "confirmed" })).toContain("pair locked");
    expect(pairStatusLabel({ ...base, status: "awaiting_payment" })).toContain("awaiting payment");
  });
});
