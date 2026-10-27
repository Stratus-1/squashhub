import { describe, expect, it } from "vitest";
import { cashUpFigures } from "@/components/club-admin/bar/CashUpsReport";

describe("cash-up cash expenses", () => {
  it("deducts the R230 expense from R230 opening plus R20 sales", () => {
    const row = { id: "current", period_start: "2026-10-25", period_end: "2026-10-27", expected_cash: 20, counted_cash: 20, variance: 0, card_expected: 0, card_counted: 0, written_off: false, write_off_amount: 0, note: null, closed_by_name: null, totals: { cash_opening: 230, cash_movements: -230, methods: { cash: { sales: 20, tips: 0, count: 1 } } } };
    expect(cashUpFigures(row, undefined).cashShould).toBe(20);
    expect(cashUpFigures(row, { ...row, counted_cash: 230 }).cashShould).toBe(20);
  });
});