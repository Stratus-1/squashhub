import { describe, expect, it } from "vitest";
import {
  billingOptionLabel,
  cycleToOption,
  invoicedInAdvanceLabel,
  monthsPerInvoice,
  nextInvoiceDate,
  normalizeBillingOption,
  optionToCycle,
} from "@/lib/billing/frequency";

describe("canonical billing frequency", () => {
  it("normalises legacy and null values", () => {
    expect(normalizeBillingOption(null)).toBe("monthly");
    expect(normalizeBillingOption("six_monthly")).toBe("biannual_upfront");
    expect(normalizeBillingOption("6-monthly")).toBe("biannual_upfront");
    expect(normalizeBillingOption("yearly")).toBe("annual_upfront");
    expect(normalizeBillingOption("annual_upfront")).toBe("annual_upfront");
  });

  it("maps options to invoice cycles and back", () => {
    expect(optionToCycle("biannual_upfront")).toBe("biannual");
    expect(optionToCycle("annual_upfront")).toBe("annual");
    expect(optionToCycle("monthly")).toBe("monthly");
    expect(cycleToOption("biannual")).toBe("biannual_upfront");
    expect(cycleToOption("annual")).toBe("annual_upfront");
  });

  it("uses the right period length per invoice", () => {
    expect(monthsPerInvoice("monthly")).toBe(1);
    expect(monthsPerInvoice("biannual_upfront")).toBe(6);
    expect(monthsPerInvoice("annual_upfront")).toBe(12);
  });

  it("labels each option consistently", () => {
    expect(billingOptionLabel("biannual_upfront")).toBe("6-monthly upfront");
    expect(billingOptionLabel("annual_upfront")).toBe("Annual upfront");
    expect(billingOptionLabel("monthly")).toBe("Monthly");
    expect(invoicedInAdvanceLabel("biannual_upfront")).toBe("six-monthly in advance");
  });

  it("computes UTC-safe next invoice dates that clamp at month end", () => {
    expect(nextInvoiceDate("2026-09-01", "biannual_upfront").toISOString().slice(0, 10)).toBe("2027-03-01");
    expect(nextInvoiceDate("2026-09-01", "annual_upfront").toISOString().slice(0, 10)).toBe("2027-09-01");
    expect(nextInvoiceDate("2026-08-31", "biannual_upfront").toISOString().slice(0, 10)).toBe("2027-02-28");
    expect(nextInvoiceDate("2026-09-30", "monthly").toISOString().slice(0, 10)).toBe("2026-10-30");
  });
});
