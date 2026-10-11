import { describe, it, expect } from "vitest";
import { countEntries } from "@/lib/tournaments/entry-counts";

const reg = (id: string, divs: number[], fee: string, status = "registered") =>
  ({ club_member_id: id, division_choices: divs, registration_status: status, fee_status: fee, registration_source: "organiser" });

describe("entry counts are independent of payment", () => {
  it("pay-before-entry = No: unpaid organiser entries count, fee tracked separately", () => {
    const c = countEntries([reg("a", [1], "due"), reg("b", [3, 5], "due"), reg("c", [2], "paid")]);
    expect(c).toEqual({ uniquePlayers: 3, totalEntries: 4, paidEntries: 1, outstandingEntries: 3 });
  });
  it("dual-category player = one person, two category entries", () => {
    const c = countEntries([reg("lady", [4, 5], "on_account")]);
    expect(c.uniquePlayers).toBe(1);
    expect(c.totalEntries).toBe(2);
    expect(c.paidEntries).toBe(2);
  });
  it("pay-before-entry = Yes: entries still invited (unpaid) are not counted", () => {
    const c = countEntries([reg("a", [1], "due", "invited"), reg("b", [1], "paid")]);
    expect(c).toMatchObject({ uniquePlayers: 1, totalEntries: 1, paidEntries: 1, outstandingEntries: 0 });
  });
  it("free tournament shows no paid/outstanding split", () => {
    const c = countEntries([reg("a", [1], "not_required")]);
    expect(c).toMatchObject({ totalEntries: 1, paidEntries: 0, outstandingEntries: 0 });
  });
});
