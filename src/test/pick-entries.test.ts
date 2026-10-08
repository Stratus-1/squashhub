import { describe, it, expect } from "vitest";
import { placesOf, togglePlace, addPlace, pickCounts, blockedReason, entrantsFromPicks } from "@/lib/smart-builder/pick-entries";
import { unitsFor, partnerIn, type RegLite } from "@/lib/smart-builder/step-draw";

const UNITS = ["MS", "MD", "XD", "OD"];

describe("multi-event Pick players", () => {
  it("one player in one event", () => {
    const p = togglePlace({}, "albert", "MS");
    expect(placesOf(p, "albert")).toEqual(["MS"]);
    expect(pickCounts(p)).toEqual({ uniquePlayers: 1, totalEntries: 1 });
    expect(entrantsFromPicks(p, UNITS, () => null)).toEqual([{ memberId: "albert", partnerId: null, division: 1 }]);
  });

  it("one player in three events = one person, three entries", () => {
    let p = togglePlace({}, "albert", "MS");
    p = togglePlace(p, "albert", "MD");
    p = togglePlace(p, "albert", "XD");
    expect(pickCounts(p)).toEqual({ uniquePlayers: 1, totalEntries: 3 });
    expect(entrantsFromPicks(p, UNITS, () => null).map((e) => e.division)).toEqual([1, 2, 3]);
  });

  it("several players with different combinations", () => {
    const p = { albert: ["MS", "MD", "XD"], ben: ["MD"], cara: ["XD", "OD"], dan: [] };
    expect(pickCounts(p)).toEqual({ uniquePlayers: 4, totalEntries: 6 });
  });

  it("ticks for renamed/removed events are kept but never handed over as entrants", () => {
    const p = { albert: ["MS", "Mens X"], ben: ["Mens X"] };
    const ents = entrantsFromPicks(p, UNITS, () => null);
    expect(ents).toEqual([{ memberId: "albert", partnerId: null, division: 1 }]);
    expect(ents.every((e) => e.division !== null)).toBe(true);
  });

  it("removing one event keeps the player and other events", () => {
    const p = togglePlace({ albert: ["MS", "MD", "XD"] }, "albert", "MD");
    expect(placesOf(p, "albert")).toEqual(["MS", "XD"]);
    const none = togglePlace(togglePlace(p, "albert", "MS"), "albert", "XD");
    expect("albert" in none).toBe(true);
    expect(pickCounts(none)).toEqual({ uniquePlayers: 1, totalEntries: 0 });
  });

  it("eligibility-blocked events give a reason", () => {
    expect(blockedReason(false, "ladies")).toBe("Ladies only");
    expect(blockedReason(false, "mens")).toBe("Men only");
    expect(blockedReason(true, "ladies")).toBeNull();
  });

  it("legacy saved single-key selections load as one event", () => {
    expect(placesOf({ albert: "MD" }, "albert")).toEqual(["MD"]);
    expect(placesOf({ albert: "" }, "albert")).toEqual([]);
    expect(pickCounts({ albert: "MD", ben: "" })).toEqual({ uniquePlayers: 2, totalEntries: 1 });
    expect(placesOf(addPlace({ albert: "MD" }, "albert", "MD"), "albert")).toEqual(["MD"]);
  });

  it("time-capped single-event mode replaces instead of adding", () => {
    expect(placesOf(togglePlace({ albert: ["MS"] }, "albert", "MD", true), "albert")).toEqual(["MD"]);
  });

  it("per-event partners: same person paired differently in two doubles events", () => {
    const p = { albert: ["MD", "XD"], ben: ["MD"], cara: ["XD"] };
    const pairs: Record<string, [string, string][]> = { MD: [["albert", "ben"]], XD: [["albert", "cara"]] };
    const partner = (id: string, k: string) => pairs[k]?.find((x) => x.includes(id))?.find((x) => x !== id) ?? null;
    const ents = entrantsFromPicks(p, UNITS, partner);
    expect(ents).toContainEqual({ memberId: "albert", partnerId: "ben", division: 2 });
    expect(ents).toContainEqual({ memberId: "albert", partnerId: "cara", division: 3 });
  });

  it("draw sees each event's pair from one registration per person", () => {
    const regs: RegLite[] = [
      { club_member_id: "albert", partner_member_id: "ben", status: "invited", division_choices: [1, 2, 3], division_partners: { "2": "ben", "3": "cara" } },
      { club_member_id: "ben", partner_member_id: "albert", status: "invited", division_choices: [2], division_partners: { "2": "albert" } },
      { club_member_id: "cara", partner_member_id: "albert", status: "invited", division_choices: [3], division_partners: { "3": "albert" } },
      { club_member_id: "dan", partner_member_id: null, status: "invited", division_choices: [1], division_partners: {} },
    ];
    expect(unitsFor(regs, 1, 4, false).units.map((u) => u.member).sort()).toEqual(["albert", "dan"]);
    expect(unitsFor(regs, 2, 4, true)).toEqual({ units: [{ member: "albert", partner: "ben" }], errors: [] });
    expect(unitsFor(regs, 3, 4, true)).toEqual({ units: [{ member: "albert", partner: "cara" }], errors: [] });
    expect(partnerIn(regs[0], 1)).toBeNull();
  });

  it("legacy registrations without per-event partners still pair", () => {
    const regs: RegLite[] = [
      { club_member_id: "a", partner_member_id: "b", status: "invited", division_choices: [2] },
      { club_member_id: "b", partner_member_id: "a", status: "invited", division_choices: [2] },
    ];
    expect(unitsFor(regs, 2, 2, true).units).toEqual([{ member: "a", partner: "b" }]);
  });
});
