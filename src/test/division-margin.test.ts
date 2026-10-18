import { describe, expect, it } from "vitest";
import { divisionMargins } from "@/lib/finance/division-margin";
describe("separate shop and bar purchase-based margins", () => {
 const entries = [
 { account: "bar_income", debit: 0, credit: 1000 }, { account: "bar_expense", debit: 600, credit: 0 },
 { account: "shop_income", debit: 0, credit: 500 }, { account: "shop_expense", debit: 200, credit: 0 },
 { account: "membership_income", debit: 0, credit: 9000 }];
 it("bar uses only its own sales and purchases", () => expect(divisionMargins(entries)[0]).toMatchObject({ division: "bar", sales: 1000, purchases: 600, profit: 400, margin: 40 }));
 it("shop uses only its own sales and purchases", () => expect(divisionMargins(entries)[1]).toMatchObject({ division: "shop", sales: 500, purchases: 200, profit: 300, margin: 60 }));
 it("nets reversals within their division", () => expect(divisionMargins([...entries, {account: "shop_income", debit: 100, credit: 0}])[1].margin).toBe(50));
 it("has no margin when sales are zero", () => expect(divisionMargins([], true)[1].margin).toBeNull());
 it("omits unused shops", () => expect(divisionMargins([])).toHaveLength(1));
 it("uses sold-item snapshot costs instead of purchases on cost-of-sales basis", () => {
   const rows = divisionMargins(entries, true, "cost_of_sales", [{division: "bar", cogs: 250, uncosted_lines: 0}, {division: "shop", cogs: 120, uncosted_lines: 0}]);
   expect(rows[0]).toMatchObject({tradingCost: 250, profit: 750, margin: 75});
   expect(rows[1]).toMatchObject({tradingCost: 120, profit: 380, margin: 76});
 });
 it("allocated barman salary reduces only Bar gross profit on either basis", () => {
   const salary = [...entries, {account: "bar_cost_of_sales", debit: 100, credit: 0}];
   expect(divisionMargins(salary)[0].profit).toBe(300);
   expect(divisionMargins(salary)[1].profit).toBe(300);
   expect(divisionMargins(salary, true, "cost_of_sales", [{division: "bar", cogs: 250, uncosted_lines: 0}])[0].profit).toBe(650);
 });
 it("allocated Shop direct costs and reversals stay separate from Bar", () => {
   const rows = divisionMargins([...entries, {account: "shop_cost_of_sales", debit: 80, credit: 0}, {account: "shop_cost_of_sales", debit: 0, credit: 20}]);
   expect(rows[1]).toMatchObject({directCosts: 60, profit: 240, margin: 48});
   expect(rows[0].profit).toBe(400);
 });
 it("reports missing snapshots without inventing average costs", () => {
   expect(divisionMargins(entries, false, "cost_of_sales", [{division: "bar", cogs: 40, uncosted_lines: 2}])[0]).toMatchObject({cogs: 40, uncostedLines: 2});
 });
 it("Nelspruit capitalised invoice still reports R2705.76 purchases without changing stock or bank", () => {
   const rows = divisionMargins([
     {account: "bar_expense", debit: 2705.76, credit: 0, journal_ref: "invoice"},
     {account: "bank_current", debit: 0, credit: 2705.76, journal_ref: "invoice"},
     {account: "bar_expense", debit: 0, credit: 2705.76, journal_ref: "correction"},
     {account: "bar_stock_on_hand", debit: 2705.76, credit: 0, journal_ref: "correction"},
   ]);
   expect(rows[0]).toMatchObject({purchases: 2705.76, tradingCost: 2705.76, profit: -2705.76});
 });
 it("invoice-linked stock purchases stay separate by division", () => {
   const rows = divisionMargins([{account: "bar_stock_on_hand", debit: 200, credit: 0, journal_ref: "shop-invoice"}], false, "purchases", [], [{id: "shop-invoice", division: "shop"}]);
   expect(rows[0].purchases).toBe(0);
   expect(rows[1].purchases).toBe(200);
 });
 it("stocktake gains are not purchases", () => {
   expect(divisionMargins([{account: "bar_stock_on_hand", debit: 500, credit: 0, journal_ref: "stocktake"}])[0].purchases).toBe(0);
 });
 it("capitalised purchases are replaced, not added, on COS basis", () => {
   expect(divisionMargins([{account: "bar_stock_on_hand", debit: 600, credit: 0, journal_ref: "invoice"}], false, "cost_of_sales", [{division: "bar", cogs: 250, uncosted_lines: 0}], [{id: "invoice", division: "bar"}])[0]).toMatchObject({purchases: 600, tradingCost: 250, profit: -250});
 });
});
