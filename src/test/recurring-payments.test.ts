import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECURRING_SETTINGS, allowedPeriods, arrearsOfferOpen, clubRecurringAvailable,
  monthlyInstalment, planChargeExtra, recurringGatewayFor, supportsRecurring,
} from "@/lib/recurring-payments";

const s = { ...DEFAULT_RECURRING_SETTINGS("c"), allowed_months: [3, 6, 12], arrears_enabled: true,
  arrears_from: "2026-10-01", arrears_until: "2026-12-31", arrears_max_months: 6, arrears_min_amount: 200 };

describe("recurring payments", () => {
  it("gateway capability comes from one list", () => {
    expect(supportsRecurring("payfast")).toBe(true);
    expect(supportsRecurring("yoco")).toBe(false);
    expect(recurringGatewayFor({ payment_gateway: "yoco", payment_gateways: ["stitch"] })).toBe("stitch");
  });
  it("club switch hides recurring", () => {
    expect(clubRecurringAvailable("payfast", { ...s, recurring_enabled: false })).toBe(false);
    expect(clubRecurringAvailable("payfast", s)).toBe(true);
  });
  it("periods filtered and capped for balances", () => {
    expect(allowedPeriods(s)).toEqual([3, 6, 12]);
    expect(allowedPeriods(s, true)).toEqual([3, 6]);
  });
  it("offer window and minimum", () => {
    expect(arrearsOfferOpen(s, 500, "2026-09-30")).toBe(false);
    expect(arrearsOfferOpen(s, 500, "2026-10-01")).toBe(true);
    expect(arrearsOfferOpen(s, 150, "2026-11-01")).toBe(false);
    expect(arrearsOfferOpen(s, 500, "2027-01-01")).toBe(false);
  });
  it("instalments cover the balance and never over-collect", () => {
    expect(monthlyInstalment(1000, 3)).toBe(333.34);
    expect(planChargeExtra({ total_amount: 1000, monthly_extra: 333.34, amount_collected: 666.68 }, 900)).toBe(333.32);
    expect(planChargeExtra({ total_amount: 1000, monthly_extra: 333.34, amount_collected: 0 }, 100)).toBe(100);
    expect(planChargeExtra({ total_amount: 1000, monthly_extra: 333.34, amount_collected: 0 }, 0)).toBe(0);
  });
});
