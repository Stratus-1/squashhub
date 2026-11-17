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
