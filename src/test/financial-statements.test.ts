import { describe, it, expect } from "vitest";
import { thisFinancialYear, previousFinancialYear } from "@/lib/finance/financial-year";
import { buildBalanceSheet } from "@/lib/finance/balance-sheet";

describe("financial year periods (year end February)", () => {
  it("this financial year runs 1 March to today", () => {
    expect(thisFinancialYear(2, new Date(2026, 9, 30))).toEqual({ from: "2026-03-01", to: "2026-10-30" });
  });
  it("in January/February the year still started last March", () => {
    expect(thisFinancialYear(2, new Date(2027, 1, 10)).from).toBe("2026-03-01");
  });
  it("previous financial year is 1 March last year to end of February this year", () => {
    expect(previousFinancialYear(2, new Date(2026, 9, 30))).toEqual({ from: "2025-03-01", to: "2026-02-28" });
    expect(previousFinancialYear(2, new Date(2028, 5, 1)).to).toBe("2028-02-29");
  });
  it("December year end uses the calendar year", () => {
    expect(previousFinancialYear(12, new Date(2026, 9, 30))).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });
});

describe("balance sheet from trial balance", () => {
  const meta: Record<string, any> = {
    bank_current: { label: "Bank", category: "Asset" },
    creditors: { label: "Payables", category: "Liability" },
    opening_balance_equity: { label: "Opening equity", category: "Liability" },
    bar_income: { label: "Bar", category: "Income" },
    rent: { label: "Rent", category: "Expense" },
  };
  const metaFor = (l: any) => (meta[l.account] ? { key: l.account, meta: meta[l.account] } : null);
  const lines = [
    { account: "bank_current", debit: 1000, credit: 0, created_at: "2025-06-01T00:00:00Z" },
    { account: "opening_balance_equity", debit: 0, credit: 1000, created_at: "2025-06-01T00:00:00Z" },
    { account: "bank_current", debit: 300, credit: 0, created_at: "2025-12-01T00:00:00Z" },
    { account: "bar_income", debit: 0, credit: 300, created_at: "2025-12-01T00:00:00Z" },
    { account: "rent", debit: 100, credit: 0, created_at: "2026-04-01T00:00:00Z" },
    { account: "creditors", debit: 0, credit: 100, created_at: "2026-04-01T00:00:00Z" },
    { account: "bank_current", debit: 50, credit: 0, created_at: "2026-11-05T00:00:00Z" },
    { account: "bar_income", debit: 0, credit: 50, created_at: "2026-11-05T00:00:00Z" },
  ];
  const bs = buildBalanceSheet(lines, metaFor, "2026-10-31T00:00:00Z", "2026-03-01T00:00:00Z");
  it("splits prior-year and current-year surplus and balances", () => {
    expect(bs.totalAssets).toBe(1300);
    expect(bs.totalLiabilities).toBe(100);
    expect(bs.equity.find(e => e.key === "accumulated_surplus")!.amount).toBe(300);
    expect(bs.equity.find(e => e.key === "current_surplus")!.amount).toBe(-100);
    expect(bs.balanced).toBe(true);
  });
});
