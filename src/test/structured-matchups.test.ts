import { describe, it, expect } from "vitest";
import { structuredMatchups, matchupForGroup, matchupHeading, validateStandingsUnits } from "@/lib/tournaments/structured-matchups";
const spec = { divisions: [
  { groupNumber: 1, entryGroups: [1, 2], poolLabels: ["Men's › A", "Men's › B"], stages: [{ mapping: { positions: [["a1+a2"], ["b1+b2"]] } }] },
  { groupNumber: 3, entryGroups: [3, 4], poolLabels: ["Ladies › A", "Ladies › B"], stages: [{ mapping: { positions: [["c1+c2"], ["d1+d2"]] } }] },
]};
const entries = [
  { club_member_id: "a1", partner_member_id: "a2", group_number: 1 },
  { club_member_id: "b1", partner_member_id: "b2", group_number: 2 },
  { club_member_id: "c1", partner_member_id: "c2", group_number: 3 },
  { club_member_id: "d2", partner_member_id: "d1", group_number: 4 },
];
describe("structured matchups", () => {
  const mus = structuredMatchups(spec);
  it("heading names both sides and never mixes parents", () => {
    expect(matchupHeading(matchupForGroup(mus, 2)!, String)).toBe("Men's › A vs Men's › B");
    expect(matchupForGroup(mus, 4)!.entryGroups).toEqual([3, 4]);
  });
  it("valid pairs pass", () => expect(validateStandingsUnits(spec, entries, mus)).toEqual([]));
  it("flags wrong group, missing partner and duplicates", () => {
    const bad = [...entries.slice(0, 3), { club_member_id: "d1", partner_member_id: null, group_number: 4 }, { club_member_id: "a1", partner_member_id: null, group_number: 2 }];
    const msgs = validateStandingsUnits(spec, bad as any, mus).map((i) => i.message).join("|");
    expect(msgs).toMatch(/duplicate/); expect(msgs).toMatch(/no partner/); expect(msgs).toMatch(/differently/);
  });
});
