import { describe, expect, it } from "vitest";
import { foldDoublesEntries } from "@/lib/tournaments/doubles-display-entries";

const pairs = [
  { group_number: 1, member_a: "deon", member_b: "siyanda", member_a_name: "Deon", member_b_name: "Siyanda" },
  { group_number: 3, member_a: "deon", member_b: "lazelle", member_a_name: "Deon", member_b_name: "Lazelle" },
  { group_number: 1, member_a: "linden", member_b: "clayton", member_a_name: "Linden", member_b_name: "Clayton" },
];

describe("foldDoublesEntries", () => {
  it("uses each category's own partner when a player is in two categories", () => {
    const rows = foldDoublesEntries([
      { club_member_id: "deon", partner_member_id: null, group_number: 1 },
      { club_member_id: "deon", partner_member_id: null, group_number: 3 },
    ], pairs);
    expect(rows.find((r) => r.group_number === 1)?.partner_member_id).toBe("siyanda");
    expect(rows.find((r) => r.group_number === 3)?.partner_member_id).toBe("lazelle");
  });

  it("lists a team once even when the later row already names the partner", () => {
    const rows = foldDoublesEntries([
      { club_member_id: "linden", partner_member_id: null, group_number: 1 },
      { club_member_id: "clayton", partner_member_id: "linden", group_number: 1 },
    ], pairs);
    expect(rows).toHaveLength(1);
  });

  it("keeps the same player in a different category", () => {
    const rows = foldDoublesEntries([
      { club_member_id: "linden", partner_member_id: null, group_number: 1 },
      { club_member_id: "clayton", partner_member_id: null, group_number: 1 },
      { club_member_id: "linden", partner_member_id: null, group_number: 3 },
    ], pairs);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.group_number === 3)[0].partner_member_id).toBeNull();
  });
});
