import { describe, it, expect } from "vitest";
import { transactionAccountGroups } from "./transaction-accounts";

const STD = {
  bank_current: { category: "Asset" }, cash: { category: "Asset" }, debtors: { category: "Asset" },
  bar_stock_on_hand: { category: "Asset" }, creditors: { category: "Liability" }, member_credits: { category: "Liability" },
  association_payable: { category: "Liability" }, opening_balance_equity: { category: "Liability" },
  fee_income: { category: "Income" }, maintenance: { category: "Expense" }, bar_cost_of_sales: { category: "Expense" },
} as const;
const CUSTOM = [
  { id: "loan", category: "Asset" }, { id: "cot", category: "Asset" },
  { id: "sec", category: "Expense" }, { id: "int", category: "Income" },
];

describe("Enter Transaction account choices", () => {
  it("payments out include balance sheet accounts (liabilities and assets)", () => {
    const g = transactionAccountGroups("expense", STD as any, CUSTOM);
    expect(g.standardBS).toEqual(["bar_stock_on_hand", "creditors", "member_credits", "association_payable", "opening_balance_equity"]);
    expect(g.customBS.map((a) => a.id)).toEqual(["loan", "cot"]);
    expect(g.standardPL).toEqual(["maintenance"]);
    expect(g.customPL.map((a) => a.id)).toEqual(["sec"]);
  });

  it("income includes balance sheet accounts (assets and liabilities)", () => {
    const g = transactionAccountGroups("income", STD as any, CUSTOM);
    expect(g.standardBS).toContain("bar_stock_on_hand");
    expect(g.standardBS).toContain("creditors");
    expect(g.customBS.map((a) => a.id)).toEqual(["loan", "cot"]);
    expect(g.standardPL).toEqual(["fee_income"]);
    expect(g.customPL.map((a) => a.id)).toEqual(["int"]);
  });

  it("never offers the money accounts, Accounts Receivable or cost of sales", () => {
    for (const d of ["income", "expense"] as const) {
      const g = transactionAccountGroups(d, STD as any, CUSTOM);
      const all = [...g.standardBS, ...g.standardPL];
      for (const k of ["bank_current", "cash", "debtors", "bar_cost_of_sales"]) expect(all).not.toContain(k);
    }
  });
});
