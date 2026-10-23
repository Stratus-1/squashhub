import { describe, expect, it } from "vitest";
import { isPayrollAmountInput, payrollAmount, payrollLineError } from "@/lib/bar/payroll";

describe("bar payroll input rules", () => {
  it("accepts whole rands and two-decimal amounts, rejects negatives and extra decimals", () => {
    expect(isPayrollAmountInput("")).toBe(true);
    expect(isPayrollAmountInput("1500")).toBe(true);
    expect(isPayrollAmountInput("75.30")).toBe(true);
    expect(isPayrollAmountInput("75.305")).toBe(false);
    expect(isPayrollAmountInput("-10")).toBe(false);
    expect(isPayrollAmountInput("abc")).toBe(false);
  });

  it("parses amounts and rejects non-numeric input", () => {
    expect(payrollAmount("75.30")).toBe(75.3);
    expect(payrollAmount("0")).toBe(0);
    expect(Number.isNaN(payrollAmount("x"))).toBe(true);
  });

  it("blocks tips above the unpaid balance and empty lines", () => {
    expect(payrollLineError("0", "60", 55.3)).toBe("Tips exceed the unpaid tip balance");
    expect(payrollLineError("0", "0", 55.3)).toBe("Nothing to pay on this line");
    expect(payrollLineError("1500", "55.30", 55.3)).toBeNull();
    expect(payrollLineError("0", "55.30", 55.3)).toBeNull();
  });
});

import { suggestedPay } from "@/lib/bar/payroll";
describe("suggestedPay", () => {
  it("multiplies the shift rate by shifts worked", () => { expect(suggestedPay("shift", 0, 250, 6)).toBe(1500); });
  it("uses the fixed salary for monthly staff regardless of shifts", () => { expect(suggestedPay("monthly", 1000, 250, 6)).toBe(1000); });
  it("pays nothing for zero shifts", () => { expect(suggestedPay("shift", 0, 250, 0)).toBe(0); });
});
