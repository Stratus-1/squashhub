import { describe, expect, it } from "vitest";
import { groupedIncome } from "@/lib/finance/grouped-income";
const accounts = Object.fromEntries([
  ["membership_income", "Member fees", "Income"], ["bar_income", "Bar", "Income"], ["shop_income", "Shop", "Income"],
  ["bar_expense", "Purchases", "Expense"], ["shop_expense", "Purchases", "Expense"], ["bar_cost_of_sales", "Bar direct costs", "Expense"], ["shop_cost_of_sales", "Shop direct costs", "Expense"], ["rent", "Rent", "Expense"],
].map(([id, label, category]) => [id, { label, category }]));
const lines = [
  { account: "membership_income", debit: 0, credit: 9000 }, { account: "bar_income", debit: 0, credit: 1000 }, { account: "shop_income", debit: 0, credit: 500 },
  { account: "bar_expense", debit: 600, credit: 0 }, { account: "shop_expense", debit: 200, credit: 0 },
  { account: "bar_cost_of_sales", debit: 100, credit: 0, description: "Barman salary" }, { account: "shop_cost_of_sales", debit: 80, credit: 0, description: "Shop wages" }, { account: "rent", debit: 50, credit: 0 },
];
describe("grouped income statement", () => {
  it("keeps fee income separate from trading sales", () => {
    const report = groupedIncome(lines, accounts, true, "purchases");
    expect(report.primaryTotal).toBe(9000);
    expect(report.primary).toHaveLength(1);
  });
  it("deducts purchases and allocated wages above gross income, once", () => {
    const report = groupedIncome(lines, accounts, true, "purchases");
    expect(report.divisions.map(row => row.profit)).toEqual([300, 220]);
    expect(report.generalExpenses).toBe(50);
    expect(report.grossIncome).toBe(9520);
    expect(report.netProfit).toBe(9470);
  });
  it("replaces purchases with sold-item costs but retains allocated salaries", () => {
    const report = groupedIncome(lines, accounts, true, "cost_of_sales", [{ division: "bar", cogs: 250, uncosted_lines: 0 }, { division: "shop", cogs: 120, uncosted_lines: 0 }]);
    expect(report.divisions.map(row => row.profit)).toEqual([650, 300]);
    expect(report.netProfit).toBe(9900);
    expect(report.divisions[0].allocated).toEqual([{ label: "Barman salary", amount: 100 }]);
  });
});