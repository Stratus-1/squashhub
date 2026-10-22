import { describe, expect, it } from "vitest";
import { computeSpendSummary as s } from "@/lib/account-charge-gate";
const b = { currentOwing: 0, mandateAllowance: 0, approvedCredit: 0, bookingMin: null, barGated: false };
describe("available to spend", () => {
  it("credit balance is spendable", () => expect(s({ ...b, currentOwing: -100 }).available).toBe(100));
  it("recurring allowance counts", () => expect(s({ ...b, currentOwing: 450, mandateAllowance: 500 }).available).toBe(50));
  it("credit allowed counts (R300)", () => expect(s({ ...b, currentOwing: 55, approvedCredit: 300 }).available).toBe(245));
  it("R20 minimum shortfall at R0", () => expect(s({ ...b, bookingMin: 20 }).bookingShortfall).toBe(20));
  it("no minimum → no booking shortfall", () => expect(s({ ...b, currentOwing: 50 }).bookingShortfall).toBe(0));
  it("bar warning only when gated", () => {
    expect(s({ ...b, barGated: true }).barBlocked).toBe(true);
    expect(s({ ...b, barGated: false }).barBlocked).toBe(false);
  });
});
