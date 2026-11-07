import { describe, it, expect } from "vitest";
import { findPossibleDuplicates, johannesburgDate } from "./duplicate-transaction";

const lights = {
  account: "bank_current", debit: 1500, credit: 0, description: "EFT Maryna Lights",
  created_at: "2026-10-27T08:00:00Z", journal_ref: "a",
};

describe("findPossibleDuplicates", () => {
  it("flags the same amount received into the bank on the same day", () => {
    const hits = findPossibleDuplicates([lights], { moneyAccount: "bank_current", direction: "income", amount: 1500, date: "2026-10-27" });
    expect(hits.map((h) => h.description)).toEqual(["EFT Maryna Lights"]);
  });

  it("ignores a different day, amount, direction or money account", () => {
    const base = { moneyAccount: "bank_current" as const, direction: "income" as const, amount: 1500, date: "2026-10-27" };
    expect(findPossibleDuplicates([lights], { ...base, date: "2026-10-28" })).toHaveLength(0);
    expect(findPossibleDuplicates([lights], { ...base, amount: 1499.99 })).toHaveLength(0);
    expect(findPossibleDuplicates([lights], { ...base, direction: "expense" })).toHaveLength(0);
    expect(findPossibleDuplicates([lights], { ...base, moneyAccount: "cash" })).toHaveLength(0);
  });

  it("uses the Johannesburg day, not UTC", () => {
    expect(johannesburgDate("2026-10-27T22:30:00Z")).toBe("2026-10-28");
    const late = { ...lights, created_at: "2026-10-27T22:30:00Z" };
    expect(findPossibleDuplicates([late], { moneyAccount: "bank_current", direction: "income", amount: 1500, date: "2026-10-28" })).toHaveLength(1);
  });

  it("flags payments out by the credit side", () => {
    const paid = { account: "bank_current", debit: 0, credit: 300, description: "Marizel Katz", created_at: "2026-10-29T10:00:00Z", journal_ref: "m" };
    expect(findPossibleDuplicates([paid], { moneyAccount: "bank_current", direction: "expense", amount: 300, date: "2026-10-29" })).toHaveLength(1);
  });
});
