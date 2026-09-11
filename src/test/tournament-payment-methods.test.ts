import { describe, expect, it } from "vitest";
import { acceptsAccountCharge, accountChargeLabel } from "@/lib/tournaments/payment-methods";

describe("tournament account payment method", () => {
  it("is available only when the organiser enables it", () => {
    expect(acceptsAccountCharge(["card", "account"])).toBe(true);
    expect(acceptsAccountCharge(["card", "eft"])).toBe(false);
    expect(acceptsAccountCharge(null)).toBe(false);
  });

  it("uses an explicit member-facing amount", () => {
    expect(accountChargeLabel(15000)).toBe("Add R150.00 to my account");
  });
});