import { describe, expect, it } from "vitest";
import {
  balancesByMember,
  isOutstandingAudienceMember,
  owingMemberIds,
} from "../../supabase/functions/_shared/comms-outstanding";

const row = (club_member_id: string, account: string, debit: number, credit: number) => ({ club_member_id, account, debit, credit });

describe("outstanding-balance campaign audience", () => {
  it("includes a member who owes more than R0", () => {
    expect([...owingMemberIds([row("a", "debtors", 500, 200)])]).toEqual(["a"]);
  });

  it("excludes a member whose balance is fully paid", () => {
    expect(owingMemberIds([row("a", "debtors", 500, 500)]).size).toBe(0);
  });

  it("excludes a member in credit", () => {
    expect(owingMemberIds([row("a", "debtors", 100, 0), row("a", "member_credits", 0, 300)]).size).toBe(0);
  });

  it("nets member credit against debtors like the member statement", () => {
    const b = balancesByMember([row("a", "debtors", 1000, 0), row("a", "member_credits", 0, 250)]);
    expect(b.get("a")).toBe(750);
  });

  it("ignores ledger lines on other accounts", () => {
    expect(owingMemberIds([row("a", "bar_income", 900, 0)]).size).toBe(0);
  });

  it("includes suspended members but never resigned ones", () => {
    expect(isOutstandingAudienceMember({ status: "active" })).toBe(true);
    expect(isOutstandingAudienceMember({ status: "resigned" })).toBe(false);
    expect(isOutstandingAudienceMember({ status: "suspended" })).toBe(false);
  });
});
