import { describe, it, expect } from "vitest";
import { buildOtherLinesJournal, invoiceOffsetAccount, validateOtherLines } from "./invoice-other-lines";

describe("bar invoice other (non-stock) lines", () => {
  it("pays from the same money account as the stock lines", () => {
    expect(invoiceOffsetAccount("eft")).toBe("bank_current");
    expect(invoiceOffsetAccount("card")).toBe("bank_current");
    expect(invoiceOffsetAccount("cash")).toBe("cash");
    expect(invoiceOffsetAccount("account")).toBe("creditors");
  });

  it("debits the chosen expense and credits the bank for an EFT Makro invoice", () => {
    const j = buildOtherLinesJournal(
      [{ description: "Cleaning materials", account: "cleaning_services", amount: "245.50" }],
      { paymentMethod: "eft", supplier: "Makro", invoiceNumber: "123" },
    );
    expect(j.total).toBe(245.5);
    expect(j.lines).toEqual([
      { account: "cleaning_services", debit: 245.5, description: "Cleaning materials — Makro #123", custom_account_id: null },
      { account: "bank_current", credit: 245.5, description: "Invoice other items — Makro #123" },
    ]);
  });

  it("posts a club-made expense account to its roll-up account with its id", () => {
    const j = buildOtherLinesJournal(
      [{ description: "Mop", account: "custom:abc", amount: "80" }, { description: "Ant poison", account: "maintenance", amount: "160" }],
      { paymentMethod: "cash", customAccounts: [{ id: "abc", name: "Cleaning materials", base_account: null }] },
    );
    expect(j.lines[0]).toMatchObject({ account: "general_expense", debit: 80, custom_account_id: "abc" });
    expect(j.lines[2]).toMatchObject({ account: "cash", credit: 240 });
  });

  it("refuses incomplete lines and ignores untouched blank rows", () => {
    expect(validateOtherLines([{ description: "", account: "", amount: "" }])).toBeNull();
    expect(validateOtherLines([{ description: "Soap", account: "", amount: "20" }])).toMatch(/account/);
    expect(validateOtherLines([{ description: "Soap", account: "general_expense", amount: "0" }])).toMatch(/amount/);
    expect(buildOtherLinesJournal([{ description: "", account: "", amount: "" }], { paymentMethod: "eft" }).lines).toEqual([]);
  });
});
