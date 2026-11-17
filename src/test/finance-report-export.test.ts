import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { incomeStatementReport, trialBalanceReport, reportCsv, reportWorkbook, reportPdf } from "@/lib/finance/report-export";
import { groupedIncome } from "@/lib/finance/grouped-income";

const line = (account: string, debit: number, credit: number) => ({ account, debit, credit, created_at: "2026-10-01T10:00:00Z", journal_ref: "j", description: null, custom_account_id: null });
const accounts = {
  membership_fees: { label: "Fee Income — Membership", category: "Income" },
  maintenance: { label: "Maintenance", category: "Expense" },
};
const income = groupedIncome([line("membership_fees", 0, 1000), line("maintenance", 250, 0)], accounts, false, "purchases", [], [], []);
const report = incomeStatementReport({ report: income, basis: "purchases", from: "2026-03-01", to: "2026-11-17", clubName: "Nelspruit Squash Club", currencyCode: "ZAR" });

describe("income statement export", () => {
  it("starts with club, title and the chosen period, then only report lines", () => {
    const rows = reportCsv(report).split("\r\n");
    expect(rows.slice(0, 3)).toEqual(["Nelspruit Squash Club", "Income Statement", "For the period 1 Mar 2026 to 17 Nov 2026"]);
    expect(rows).toContain("Fee Income — Membership,1000.00");
    expect(rows).toContain("Maintenance,250.00");
    expect(rows.at(-1)).toBe("Net profit,750.00");
  });

  it("writes amounts as numbers in Excel", () => {
    const ws = reportWorkbook(report).Sheets["Income Statement"];
    const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
    expect(data.find(r => r[0] === "Net profit")?.[1]).toBe(750);
  });

  it("produces a PDF document", () => {
    const pdf = reportPdf(report, n => `R ${n.toFixed(2)}`);
    expect(pdf.getNumberOfPages()).toBe(1);
  });
});

describe("trial balance export", () => {
  it("totals the debit and credit columns of the listed accounts", () => {
    const tb = trialBalanceReport({ asAt: "2026-11-17", currencyCode: "ZAR", rows: [
      { label: "Current Account", category: "Asset", debit: 1000, credit: 0 },
      { label: "Fee Income — Membership", category: "Income", debit: 0, credit: 1000 },
    ] });
    const rows = reportCsv(tb).split("\r\n");
    expect(rows[1]).toBe("As at 17 Nov 2026");
    expect(rows.at(-1)).toBe("Total,,1000.00,1000.00");
  });
});
