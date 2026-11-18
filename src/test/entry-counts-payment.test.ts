import { describe, it, expect } from "vitest";
import { countEntries } from "@/lib/tournaments/entry-counts";

const reg = (id: string, divs: number[], fee: string, status = "registered") =>
  ({ club_member_id: id, division_choices: divs, registration_status: status, fee_status: fee, registration_source: "organiser" });

describe("entry counts are independent of payment", () => {
  it("pay-before-entry = No: unpaid organiser entries count, fee tracked separately", () => {
    const c = countEntries([reg("a", [1], "due"), reg("b", [3, 5], "due"), reg("c", [2], "paid")]);
    expect(c).toMatchObject({ uniquePlayers: 3, totalEntries: 4, paidEntries: 1, outstandingEntries: 3, invitedPlayers: 0 });
  });
  it("invited players are tracked separately so a card never reads 0 while invites are out", () => {
    const c = countEntries([reg("a", [1], "not_required", "invited"), reg("b", [1], "not_required", "invited"), reg("c", [1], "not_required", "declined")]);
    expect(c).toMatchObject({ uniquePlayers: 0, totalEntries: 0, invitedPlayers: 2 });
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

describe("doubles entry counts (Uitsig No Frills shape)", () => {
  const paid = (id: string, partner: string, divs: number[]) =>
    ({ club_member_id: id, partner_member_id: partner, division_choices: divs, status: "paid", registration_status: "registered", fee_status: "paid" });
  const invitedDue = (id: string) =>
    ({ club_member_id: id, partner_member_id: null, division_choices: [], status: "pending_payment", registration_status: "invited", fee_status: "due" });
  const rows = [
    paid("bernice", "neill", [3]), paid("neill", "bernice", [3]),
    paid("duane", "jason", [1]), invitedDue("jason"),
    paid("john", "andre", [1]), invitedDue("andre"),
    invitedDue("someone"),
  ];
  it("both partners registered = 2 category entries, not 4", () => {
    const c = countEntries([paid("bernice", "neill", [3]), paid("neill", "bernice", [3])]);
    expect(c).toMatchObject({ uniquePlayers: 2, totalEntries: 2, paidEntries: 2, outstandingEntries: 0 });
  });
  it("partner who hasn't paid yet is outstanding, never paid by the entrant's fee", () => {
    const c = countEntries(rows);
    expect(c).toMatchObject({ uniquePlayers: 6, totalEntries: 6, paidEntries: 4, outstandingEntries: 2, invitedPlayers: 1 });
  });
});
