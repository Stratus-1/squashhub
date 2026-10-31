import { describe, expect, it } from "vitest";
import { hasStockMovement, stockDateRange, stockToday, stockMovementCsv, type StockMovementRow } from "@/lib/bar/stock-movement-report";

const now = new Date("2026-10-31T07:08:00Z");
const unmoved: StockMovementRow = { id: "still", name: "Unmoved stock", division: "bar", unit_label: "unit", opening: 28, receipts: 0, sales: 0, specials: 0, club_use: 0, adjustments: 0, net: 0, closing: 28, current: 28 };
describe("Stock movement visibility", () => {
  it("hides zero movements even with 28 stock units", () => expect(hasStockMovement(unmoved)).toBe(false));
  it("keeps offsetting purchases and sales with zero net", () => expect(hasStockMovement({ ...unmoved, receipts: 10, sales: -10 })).toBe(true));
  it("keeps adjustment-only movement", () => expect(hasStockMovement({ ...unmoved, adjustments: -4, net: -4 })).toBe(true));
  it("excludes unmoved stock from the download", () => {
    const csv = stockMovementCsv([unmoved, { ...unmoved, name: "Moved stock", receipts: 10, sales: -10 }], "2026-10-01", "2026-10-31", "2026-10-31T08:00Z");
    expect(csv).not.toContain("Unmoved stock");
    expect(csv).toContain("Moved stock");
  });
});
describe("Stock movement periods", () => {
  it("last day covers today in Johannesburg", () => expect(stockDateRange("day", now)).toEqual({ from: "2026-10-31", to: "2026-10-31" }));
  it("last seven days includes today and six previous days", () => expect(stockDateRange("week", now)).toEqual({ from: "2026-10-25", to: "2026-10-31" }));
  it("this month starts on the first", () => expect(stockDateRange("month", now)).toEqual({ from: "2026-10-01", to: "2026-10-31" }));
  it("last month covers the whole preceding month", () => expect(stockDateRange("last-month", now)).toEqual({ from: "2026-09-01", to: "2026-09-30" }));
  it("handles January year boundaries", () => expect(stockDateRange("last-month", new Date("2027-01-04T10:00Z"))).toEqual({ from: "2026-12-01", to: "2026-12-31" }));
  it("uses Johannesburg date across UTC midnight", () => expect(stockToday(new Date("2026-10-31T22:30Z"))).toBe("2026-11-01"));
});
describe("Stock download", () => {
  it("preserves opening, signed movements, closing and current stock", () => {
    const row: StockMovementRow = { id: "one", name: "Brandy", division: "bar", unit_label: "tot", opening: 56, receipts: 28, sales: -4, specials: -8, club_use: -2, adjustments: -1, net: 13, closing: 69, current: 65 };
    expect(stockMovementCsv([row], "2026-10-01", "2026-10-30", "2026-10-31T07:00Z")).toContain('"56","28","-4","-8","-2","-1","13","69","65"');
  });
});