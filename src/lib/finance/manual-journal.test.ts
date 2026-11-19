import { describe, expect, it } from "vitest";
import { blankLine, journalPayload, journalProblems, journalTotals, transferProblem, applyTemplateAmount, memberWorkTemplate } from "./manual-journal";

const custom = [{ id: "c1", category: "Asset", base_account: "debtors" }, { id: "c2", category: "Expense", base_account: null }];

describe("manual journal", () => {
  it("is only ready when debits equal credits", () => {
    const lines = [blankLine({ account: "maintenance", debit: "350" }), blankLine({ account: "bank_current", credit: "300" })];
    expect(journalTotals(lines).balanced).toBe(false);
    expect(journalProblems(lines, [], "Paint")).toContain("Debits and credits differ by 50.00");
    lines[1].credit = "350";
    expect(journalProblems(lines, [], "Paint")).toEqual([]);
  });

  it("requires a member on Accounts Receivable and Member Credits lines, including club accounts that roll up to them", () => {
    const lines = [blankLine({ account: "maintenance", debit: "500" }), blankLine({ account: "debtors", credit: "500" })];
    expect(journalProblems(lines, custom, "Work")).toContain("Line 2: choose the member");
    const viaCustom = [blankLine({ account: "maintenance", debit: "5" }), blankLine({ account: "custom:c1", credit: "5" })];
    expect(journalProblems(viaCustom, custom, "x")).toContain("Line 2: choose the member");
  });

  it("refuses a line with both or neither amount", () => {
    const lines = [blankLine({ account: "rent", debit: "10", credit: "10" }), blankLine({ account: "cash" })];
    const p = journalProblems(lines, [], "x");
    expect(p).toContain("Line 1: enter either a debit or a credit");
    expect(p).toContain("Line 2: enter either a debit or a credit");
  });

  it("only sends the member on member lines and maps club accounts", () => {
    const lines = [blankLine({ account: "custom:c2", debit: "20", memberId: "m1" }), blankLine({ account: "member_credits", credit: "20", memberId: "m1" })];
    expect(journalPayload(lines, custom)).toEqual([
      { account: null, custom_account_id: "c2", debit: 20, credit: 0, member_id: null, description: null },
      { account: "member_credits", custom_account_id: null, debit: 0, credit: 20, member_id: "m1", description: null },
    ]);
  });

  it("member-did-work template debits the expense and credits the member's Accounts Receivable", () => {
    const [exp, ar] = applyTemplateAmount(memberWorkTemplate(), "750");
    expect([exp.account, exp.debit, ar.account, ar.credit]).toEqual(["maintenance", "750", "debtors", "750"]);
  });
});

describe("credit transfer amount", () => {
  it("cannot exceed the transferable credit", () => {
    expect(transferProblem("100.01", 100)).toBe("Only 100.00 credit is available to transfer");
    expect(transferProblem("100", 100)).toBeNull();
    expect(transferProblem("0", 100)).not.toBeNull();
    expect(transferProblem("1.234", 100)).not.toBeNull();
  });
});
