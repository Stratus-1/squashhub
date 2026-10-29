import { describe, expect, it } from "vitest";
import { groupedIncome, DEFAULT_INCOME_STATEMENT_BASIS } from "@/lib/finance/grouped-income";
import { accountCategoryPatch } from "@/hooks/use-club-gl-accounts";
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
  it("defaults to sold-item costs rather than stock purchases", () => {
    expect(DEFAULT_INCOME_STATEMENT_BASIS).toBe("cost_of_sales");
    const report = groupedIncome([{ account: "bar_income", debit: 0, credit: 1000 }, { account: "bar_expense", debit: 700, credit: 0 }], accounts, false, undefined, [{ division: "bar", cogs: 300, uncosted_lines: 0 }]);
    expect(report.divisions[0].tradingCost).toBe(300);
    expect(report.netProfit).toBe(700);
  });
  it("totals bar salaries as normal expenses with separate staff details, leaving tips in Bar", () => {
    const source = [
      { account: "bar_income", debit: 0, credit: 1000 },
      { account: "bar_cost_of_sales", debit: 100, credit: 0, description: "Salary — Aiden" },
      { account: "salary_wages", debit: 200, credit: 0, description: "Salary — Wynand" },
      { account: "salary_wages", debit: 0, credit: 25, description: "Salary — Wynand" },
      { account: "bar_cost_of_sales", debit: 50, credit: 0, description: "Tips paid — Aiden" },
      { account: "bank_current", debit: 0, credit: 325 },
    ];
    const before = JSON.stringify(source);
    const report = groupedIncome(source, accounts, false);
    expect(report.expenses).toEqual([{ label: "Salaries & Wages", amount: 275 }]);
    expect(report.salaryDetails).toEqual([{ label: "Aiden", amount: 100 }, { label: "Wynand", amount: 175 }]);
    expect(report.divisions[0].directCosts).toBe(50);
    expect(report.generalExpenses).toBe(275);
    expect(report.netProfit).toBe(675);
    expect(JSON.stringify(source)).toBe(before);
  });
  it("separates Grant's R100 tip income from R900 product sales", () => {
    const report = groupedIncome([{ account: "bar_income", debit: 0, credit: 900 }, { account: "bar_income", debit: 0, credit: 100, description: "Tip income — Grant" }], accounts, true, "purchases");
    expect(report.divisions[0].sales).toBe(900);
    expect(report.divisions[0].tipIncome[0].amount).toBe(100);
    expect(report.divisions[0].profit).toBe(1000);
    expect(report.divisions[1].profit).toBe(0);
  });
  it("Grant's R50 cash payout is Bar cost of sales, never general expense", () => {
    const report = groupedIncome([{ account: "bar_income", debit: 0, credit: 100, description: "Tip income — Grant" }, { account: "bar_cost_of_sales", debit: 50, credit: 0, description: "Tips paid — Grant" }, { account: "cash", debit: 0, credit: 50 }], accounts, true, "cost_of_sales");
    expect(report.divisions[0].directCosts).toBe(50);
    expect(report.divisions[0].profit).toBe(50);
    expect(report.generalExpenses).toBe(0);
    expect(report.divisions[1].directCosts).toBe(0);
  });
  it("nets each person's tips received against paid into one outstanding row", () => {
    const report = groupedIncome([
      { account: "bar_income", debit: 0, credit: 900 },
      { account: "bar_income", debit: 0, credit: 157, description: "Tip income — Aiden" },
      { account: "bar_income", debit: 0, credit: 56, description: "Tip income — Wynand" },
      { account: "bar_cost_of_sales", debit: 157, credit: 0, description: "Tips paid — Aiden" },
    ], accounts, true, "cost_of_sales");
    const bar = report.divisions[0];
    expect(bar.tipIncome).toEqual([{ label: "Tips — Wynand", amount: 56, received: 56, paid: 0 }]);
    expect(bar.allocated).toEqual([]);
    expect(bar.sales).toBe(900);
    expect(bar.profit).toBe(956);
  });
  it("stores Cost of sales Bar as an expense classification on a named account", () => {
    expect(accountCategoryPatch("bar_cost_of_sales")).toEqual({ category: "Expense", reporting_category: "bar_cost_of_sales" });
    expect(accountCategoryPatch("Expense")).toEqual({ category: "Expense", reporting_category: null });
  });
  it("stores Cost of sales Shop as an expense classification on a named account", () => {
    expect(accountCategoryPatch("shop_cost_of_sales")).toEqual({ category: "Expense", reporting_category: "shop_cost_of_sales" });
  });
  it.each(["purchases", "cost_of_sales"] as const)("deducts named salaries from Bar gross profit once on %s basis", basis => {
    const source = [...lines, { account: "general_expense", debit: 75, credit: 0, custom_account_id: "salary", description: "October" }];
    const before = JSON.stringify(source);
    const report = groupedIncome(source, accounts, true, basis, [], [], [{ id: "salary", name: "Salaries", category: "Expense", reporting_category: "bar_cost_of_sales" }]);
    expect(report.divisions[0].directCosts).toBe(175);
    expect(report.divisions[0].profit).toBe(basis === "purchases" ? 225 : 825);
    expect(report.divisions[0].allocated).toContainEqual({ label: "Salaries", amount: 75 });
    expect(report.generalExpenses).toBe(50);
    expect(JSON.stringify(source)).toBe(before);
  });
  it("deducts Shop wages and reversals from Shop only, even without shop items", () => {
    const report = groupedIncome([
      { account: "general_expense", debit: 80, credit: 0, custom_account_id: "wages" },
      { account: "general_expense", debit: 0, credit: 10, custom_account_id: "wages" },
    ], accounts, false, "purchases", [], [], [{ id: "wages", name: "Wages", category: "Expense", reporting_category: "shop_cost_of_sales" }]);
    expect(report.divisions.map(row => row.profit)).toEqual([0, -70]);
    expect(report.generalExpenses).toBe(0);
    expect(report.netProfit).toBe(-70);
  });
  it("keeps unallocated custom expenses in general expenses without double counting", () => {
    const report = groupedIncome([{ account: "rent", debit: 90, credit: 0, custom_account_id: "office" }], accounts, false, "purchases", [], [], [{ id: "office", name: "Office rent", category: "Expense" }]);
    expect(report.expenses).toEqual([{ label: "Office rent", amount: 90 }]);
    expect(report.generalExpenses).toBe(90);
  });
  it("retains historical custom direct-cost roll-ups without duplicating them", () => {
    const report = groupedIncome([{ account: "bar_cost_of_sales", debit: 50, credit: 0, custom_account_id: "legacy" }], accounts, false, "purchases", [], [], [{ id: "legacy", name: "Legacy wages", category: "Expense", base_account: "bar_cost_of_sales" }]);
    expect(report.divisions[0].directCosts).toBe(50);
    expect(report.generalExpenses).toBe(0);
  });
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