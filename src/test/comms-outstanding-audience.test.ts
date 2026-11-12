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

import { excludeMembers, formatRand, greetingName, usesOutstandingAmount } from "../../supabase/functions/_shared/comms-outstanding";
import { buildMergeVars } from "@/lib/comms/merge-fields";

describe("settle outstanding account reminder", () => {
  it("greets by first name when it is a real name", () => {
    expect(greetingName("Martin Strydom")).toBe("Martin");
  });

  it("uses the full name when the first word is initials or a title", () => {
    expect(greetingName("WD Gertenbach")).toBe("WD Gertenbach");
    expect(greetingName("J. Smith")).toBe("J. Smith");
    expect(greetingName("Mr Smith")).toBe("Mr Smith");
  });

  it("uses the whole name for a single-word name", () => {
    expect(greetingName("Lucas")).toBe("Lucas");
  });

  it("shows the amount owed in rand with cents", () => {
    expect(buildMergeVars({ member: { name: "Umar Akoojee" }, outstandingAmount: 545 }).outstanding_amount).toBe(formatRand(545));
    expect(formatRand(545)).toMatch(/^R545[.,]00$/);
  });

  it("leaves out members the admin unticked", () => {
    const owing = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(excludeMembers(owing, ["b"]).map((m) => m.id)).toEqual(["a", "c"]);
    expect(excludeMembers(owing, undefined)).toHaveLength(3);
  });

  it("detects templates that quote the outstanding amount", () => {
    expect(usesOutstandingAmount({ email: { subject: "x", body: "You owe {{ outstanding_amount }}" } })).toBe(true);
    expect(usesOutstandingAmount({ email: { subject: "Hi", body: "{{first_name}}" } })).toBe(false);
  });
});
