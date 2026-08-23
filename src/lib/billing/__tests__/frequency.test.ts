import { describe, it, expect } from "vitest";
import {
  normalizeBillingOption,
  optionToCycle,
  cycleToOption,
  monthsPerInvoice,
  billingOptionLabel,
  invoicedInAdvanceLabel,
  nextInvoiceDate,
} from "../frequency";

describe("billing frequency canonical mapping", () => {
  it("normalises legacy / ambiguous values", () => {
    expect(normalizeBillingOption("six_monthly")).toBe("biannual_upfront");
    expect(normalizeBillingOption("6-monthly")).toBe("biannual_upfront");
    expect(normalizeBillingOption("biannual")).toBe("biannual_upfront");
    expect(normalizeBillingOption("annually")).toBe("annual_upfront");
    expect(normalizeBillingOption("annual")).toBe("annual_upfront");
    expect(normalizeBillingOption(null)).toBe("monthly");
    expect(normalizeBillingOption("1 month")).toBe("monthly");
    expect(normalizeBillingOption("garbage")).toBe("monthly");
  });

  it("maps options to invoice cycles and back", () => {
    expect(optionToCycle("biannual_upfront")).toBe("biannual");
    expect(optionToCycle("annual_upfront")).toBe("annual");
    expect(optionToCycle(undefined)).toBe("monthly");
    expect(cycleToOption("biannual")).toBe("biannual_upfront");
    expect(cycleToOption("annual")).toBe("annual_upfront");
    expect(cycleToOption("monthly")).toBe("monthly");
  });

  it("knows how many months each invoice covers", () => {
    expect(monthsPerInvoice("monthly")).toBe(1);
    expect(monthsPerInvoice("biannual_upfront")).toBe(6);
    expect(monthsPerInvoice("annual_upfront")).toBe(12);
  });

  it("labels consistently", () => {
    expect(billingOptionLabel("biannual_upfront")).toBe("6-monthly upfront");
    expect(billingOptionLabel("annual_upfront")).toBe("Annual upfront");
    expect(billingOptionLabel(null)).toBe("Monthly");
    expect(invoicedInAdvanceLabel("biannual_upfront")).toBe("six-monthly in advance");
    expect(invoicedInAdvanceLabel("annual_upfront")).toBe("annually in advance");
    expect(invoicedInAdvanceLabel("monthly")).toBe("monthly in advance");
  });

  it("schedules the next invoice from the canonical option only", () => {
    expect(nextInvoiceDate("2026-09-01", "monthly").toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(nextInvoiceDate("2026-09-01", "biannual_upfront").toISOString().slice(0, 10)).toBe("2027-03-01");
    expect(nextInvoiceDate("2026-09-01", "annual_upfront").toISOString().slice(0, 10)).toBe("2027-09-01");
  });

  it("clamps end-of-month dates", () => {
    expect(nextInvoiceDate("2026-08-31", "monthly").toISOString().slice(0, 10)).toBe("2026-09-30");
    expect(nextInvoiceDate("2026-08-31", "biannual_upfront").toISOString().slice(0, 10)).toBe("2027-02-28");
  });

  it("SLA acceptance data cannot change the frequency (mapping is pure)", () => {
    const persisted = "biannual_upfront";
    // simulate an SLA acceptance payload that no longer carries a billing field
    const slaPayload: Record<string, unknown> = {
      sla_accepted_at: new Date().toISOString(),
      sla_accepted_name: "Vian Crafford",
      sla_version: "1.5",
    };
    expect("sla_billing_option" in slaPayload).toBe(false);
    expect(billingOptionLabel(persisted)).toBe("6-monthly upfront");
    expect(optionToCycle(persisted)).toBe("biannual");
  });

  it.each([
    ["monthly", "Monthly", "2026-10-01"],
    ["biannual_upfront", "6-monthly upfront", "2027-03-01"],
    ["annual_upfront", "Annual upfront", "2027-09-01"],
  ] as const)("reloads persisted %s with the correct badge and invoice date", (saved, label, nextDate) => {
    const reloaded = normalizeBillingOption(saved);
    expect(reloaded).toBe(saved);
    expect(billingOptionLabel(reloaded)).toBe(label);
    expect(nextInvoiceDate("2026-09-01", reloaded).toISOString().slice(0, 10)).toBe(nextDate);
  });
});
