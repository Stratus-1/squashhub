import { describe, expect, it } from "vitest";
import { openingBalanceAccounts, openingBalanceRows, openingBalanceValues } from "@/lib/opening-balances";
import type { ClubGLAccount } from "@/hooks/use-club-gl-accounts";

const club = "test-club";
const cot: ClubGLAccount = { id: "cot", club_id: club, name: "COT", category: "Expense", reporting_category: "bar_cost_of_sales", base_account: null, description: null, is_active: true };
const standard = { general_expense: { label: "General Expenses", type: "IS" as const, category: "Expense" as const, normal: "Dr" as const } };
const accounts = openingBalanceAccounts(standard, [cot], club);
describe("club GL opening balances", () => {
  it("includes club-created COT separately from its standard carrier", () => {
    expect(accounts.find(a => a.code === "custom:cot")).toMatchObject({ account: "general_expense", custom_account_id: "cot", meta: { label: "COT", normal: "Dr" } });
    expect(accounts.find(a => a.code === "general_expense")?.custom_account_id).toBeNull();
  });
  it("never includes another club's accounts", () => {
    expect(openingBalanceAccounts(standard, [{ ...cot, club_id: "other" }], club).map(a => a.code)).toEqual(["general_expense"]);
  });
  it("posts COT R250 separately and balances it against opening equity", () => {
    const rows = openingBalanceRows(accounts, { "custom:cot": "250", general_expense: "80" }, club, "ref", "date");
    expect(rows.find(r => r.custom_account_id === "cot")).toMatchObject({ account: "general_expense", debit: 250, credit: 0, club_id: club });
    expect(rows.find(r => r.account === "opening_balance_equity")).toMatchObject({ debit: 0, credit: 330, custom_account_id: null });
    expect(rows.reduce((sum, r) => sum + r.debit - r.credit, 0)).toBe(0);
    expect(openingBalanceValues(rows, accounts)).toEqual({ "custom:cot": "250", general_expense: "80" });
  });
  it("uses saved roll-up and credit side for liabilities", () => {
    const list = openingBalanceAccounts({}, [{ ...cot, category: "Liability", base_account: "association_payable" }], club);
    expect(openingBalanceRows(list, { "custom:cot": "100" }, club, "ref", "date")[0]).toMatchObject({ account: "association_payable", debit: 0, credit: 100, custom_account_id: "cot" });
  });
  it("retains saved balances of inactive custom accounts when reopening", () => {
    const list = openingBalanceAccounts(standard, [{ ...cot, is_active: false }], club);
    const rows = openingBalanceRows(list, { "custom:cot": "-75" }, club, "ref", "date");
    expect(openingBalanceValues(rows, list)["custom:cot"]).toBe("-75");
    expect(rows[0]).toMatchObject({ debit: 0, credit: 75 });
  });
  it("rejects invalid amounts before old entries are replaced", () => {
    expect(() => openingBalanceRows(accounts, { "custom:cot": "invalid" }, club, "ref", "date")).toThrow("COT");
  });
});