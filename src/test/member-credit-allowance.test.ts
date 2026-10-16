import { describe, expect, it } from "vitest";
import { computeBookingGate } from "@/lib/booking-balance-gate";
import { computeAccountChargeGate, previewBasketCharge } from "@/lib/account-charge-gate";

describe("approved credit shares existing financial eligibility", () => {
  const base = { fees: [], hasMandate: false, buffer: 20, approvedCredit: 300 };
  it.each([[279.99, -0.01], [280, 0], [280.01, 0.01], [300, 20]])("owing %s uses the R20 minimum and R300 allowance", (currentOwing, expected) => {
    expect(computeBookingGate({ ...base, currentOwing }).shortfall).toBe(expected);
  });
  it("qualifying active fees are excluded once, independently of credit", () => {
    const opts = { ...base, currentOwing: 1880, fees: [{ amount: 1600 }] };
    expect(computeBookingGate({ ...opts, hasMandate: true })).toEqual({ planAllowedDebt: 1600, shortfall: 0 });
    expect(computeBookingGate({ ...opts, hasMandate: false })).toEqual({ planAllowedDebt: 0, shortfall: 1600 });
  });
  it("charges consume approved allowance without creating funds", () => {
    const opts = { currentOwing: 280, fees: [], hasMandate: false, approvedCredit: 300 };
    expect(computeAccountChargeGate({ ...opts, purchase: 20 })).toMatchObject({ allowed: true, allowance: 300, projectedOwing: 300 });
    expect(computeAccountChargeGate({ ...opts, purchase: 20.01 })).toMatchObject({ allowed: false, shortfall: 0.01 });
    expect(computeBookingGate({ ...base, currentOwing: 300 }).shortfall).toBe(20);
  });
  it("R0 preserves old restrictions and credit applies without a mandate", () => {
    expect(computeBookingGate({ ...base, approvedCredit: 0, currentOwing: 0 }).shortfall).toBe(20);
    expect(computeBookingGate({ ...base, currentOwing: 0 }).planAllowedDebt).toBe(0);
  });
  it("basket uses the combined server allowance once", () => {
    const preview = { bar_gated: true, shop_gated: true, current_owing: 1700, allowance: 1900 };
    expect(previewBasketCharge({ preview, lines: [{ total: 200 }] })).toEqual({ blocked: false, shortfall: 0 });
    expect(previewBasketCharge({ preview, lines: [{ total: 200.01 }] })).toEqual({ blocked: true, shortfall: 0.01 });
  });
});