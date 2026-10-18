import { describe, expect, it } from "vitest";
import { divisionMargins } from "@/lib/finance/division-margin";
describe("separate shop and bar purchase-based margins", () => {
 const entries = [
 { account: "bar_income", debit: 0, credit: 1000 }, { account: "bar_expense", debit: 600, credit: 0 },
 { account: "shop_income", debit: 0, credit: 500 }, { account: "shop_expense", debit: 200, credit: 0 },
 { account: "membership_income", debit: 0, credit: 9000 }];
 it("bar uses only its own sales and purchases", () => expect(divisionMargins(entries)[0]).toEqual({ division: "bar", sales: 1000, purchases: 600, profit: 400, margin: 40 }));
 it("shop uses only its own sales and purchases", () => expect(divisionMargins(entries)[1]).toEqual({ division: "shop", sales: 500, purchases: 200, profit: 300, margin: 60 }));
 it("nets reversals within their division", () => expect(divisionMargins([...entries, {account: "shop_income", debit: 100, credit: 0}])[1].margin).toBe(50));
 it("has no margin when sales are zero", () => expect(divisionMargins([], true)[1].margin).toBeNull());
 it("omits unused shops", () => expect(divisionMargins([])).toHaveLength(1));
});
