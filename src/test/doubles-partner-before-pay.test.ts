import { describe, expect, it } from "vitest";
import { partnersCompleteForPayment } from "@/lib/tournaments/doubles";

const pair = (group_number: number, status: string) => ({ id: `p${group_number}`, group_number, status } as any);

describe("doubles invitation: partner first, then pay", () => {
  it("hides payment while an entered doubles event has no partner", () => {
    expect(partnersCompleteForPayment({ family_mode: false, pairs: [], managed_pairs: [] }, [1])).toBe(false);
  });
  it("shows payment once every entered doubles event has a partner", () => {
    expect(partnersCompleteForPayment({ family_mode: false, pairs: [pair(1, "pending")], managed_pairs: [] }, [1])).toBe(true);
  });
  it("needs a partner in each entered doubles event, not just one", () => {
    expect(partnersCompleteForPayment({ family_mode: false, pairs: [pair(1, "confirmed")], managed_pairs: [] }, [1, 3])).toBe(false);
  });
  it("ignores rejected or cancelled pairings", () => {
    expect(partnersCompleteForPayment({ family_mode: false, pairs: [pair(1, "rejected")], managed_pairs: [] }, [1])).toBe(false);
  });
  it("family payer is ready once one pair is built", () => {
    expect(partnersCompleteForPayment({ family_mode: true, pairs: [], managed_pairs: [pair(2, "awaiting_payment")] }, [2])).toBe(true);
  });
  it("unknown state never counts as ready", () => {
    expect(partnersCompleteForPayment(null, [1])).toBe(false);
  });
});

import { partnerPickDueCents, pairAmountOwedCents } from "@/lib/tournaments/doubles";

describe("player whose own fee is already paid picks a partner", () => {
  it("pays only the partner's R210 when they choose to cover the partner", () => {
    expect(partnerPickDueCents(21000, true, true)).toBe(21000);
  });
  it("pays nothing when the partner pays their own", () => {
    expect(partnerPickDueCents(21000, false, true)).toBe(0);
  });
  it("unpaid player still pays own fee, or both when covering the partner", () => {
    expect(partnerPickDueCents(21000, false, false)).toBe(21000);
    expect(partnerPickDueCents(21000, true, false)).toBe(42000);
  });
  it("paid payer covering an unpaid partner still owes the partner fee", () => {
    const pair = { my_fee_paid: true, payer_is_me: true, pays_for_partner: true, partner_fee_paid: false } as any;
    expect(pairAmountOwedCents(pair, 21000)).toBe(21000);
  });
  it("paid player whose partner pays their own owes nothing", () => {
    const pair = { my_fee_paid: true, payer_is_me: false, pays_for_partner: false, partner_fee_paid: false } as any;
    expect(pairAmountOwedCents(pair, 21000)).toBe(0);
  });
});

import { entryHasDoubles } from "@/lib/tournaments/doubles";

describe("doubles detection for per-category tournaments", () => {
  it("treats a 'singles' tournament whose categories are all doubles as doubles", () => {
    expect(entryHasDoubles("singles", { "1": "doubles", "2": "doubles" })).toBe(true);
  });
  it("keeps a real singles tournament as singles", () => {
    expect(entryHasDoubles("singles", { "1": "singles" })).toBe(false);
    expect(entryHasDoubles("singles", null)).toBe(false);
  });
});
