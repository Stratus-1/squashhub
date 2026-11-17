import { describe, expect, it } from "vitest";
import { groupedIncome } from "@/lib/finance/grouped-income";
import { buildBalanceSheet } from "@/lib/finance/balance-sheet";

const line = (account: string, debit: number, credit: number, description: string | null = null) =>
  ({ account, debit, credit, created_at: "2026-10-01T10:00:00Z", journal_ref: "j", description, custom_account_id: null });

describe("finance report line order", () => {
  it("lists income statement expenses and salary breakdown alphabetically", () => {
    const accounts = {
      maintenance: { label: "Maintenance", category: "Expense" as const, normal: "Dr" as const },
      accounting: { label: "accounting fees", category: "Expense" as const, normal: "Dr" as const },
      electricity: { label: "Electricity", category: "Expense" as const, normal: "Dr" as const },
      salary_wages: { label: "Salaries & Wages", category: "Expense" as const, normal: "Dr" as const },
    };
    const report = groupedIncome([
      line("maintenance", 100, 0), line("accounting", 50, 0), line("electricity", 20, 0),
      line("salary_wages", 10, 0, "Zane salary"), line("salary_wages", 10, 0, "Amy salary"),
    ], accounts, false, "purchases", [], [], []);
    expect(report.expenses.map(r => r.label)).toEqual(["accounting fees", "Electricity", "Maintenance", "Salaries & Wages"]);
    expect(report.salaryDetails.map(r => r.label)).toEqual(["Amy salary", "Zane salary"]);
  });

  it("lists balance sheet assets alphabetically, keeping surplus lines last in equity", () => {
    const meta: Record<string, { label: string; category: "Asset" | "Liability" }> = {
      stock: { label: "Stock on hand", category: "Asset" }, bank: { label: "Bank", category: "Asset" },
      cred: { label: "Trade creditors", category: "Liability" },
    };
    const bs = buildBalanceSheet(
      [line("stock", 10, 0), line("bank", 20, 0), line("cred", 0, 30)],
      l => (meta[l.account] ? { key: l.account, meta: meta[l.account] } : null),
      "2026-11-01T00:00:00Z", "2026-03-01T00:00:00Z",
    );
    expect(bs.assets.map(r => r.label)).toEqual(["Bank", "Stock on hand"]);
    expect(bs.equity.map(r => r.key).slice(-2)).toEqual(["accumulated_surplus", "current_surplus"]);
  });
});
