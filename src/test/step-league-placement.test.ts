import { describe, it, expect } from "vitest";
import { placeByLeague } from "@/lib/smart-builder/league-placement";

const units = [
  { key: "Men::A", base: "Men › A" },
  { key: "Men::B", base: "Men › B" },
  { key: "Ladies", base: "Ladies" },
];
const elig: Record<string, { mode: string; leagueIds: string[] }> = {
  "Men::A": { mode: "leagues", leagueIds: ["L2"] },
  "Men::B": { mode: "leagues", leagueIds: ["L4", "L5"] },
  Ladies: { mode: "leagues", leagueIds: ["L5"] },
};
const run = (id: string, leagues: string[], gender: string | null) =>
  placeByLeague({ memberId: id, units, eligOf: (k) => elig[k], leaguesByMember: new Map([[id, leagues]]), genderByMember: new Map([[id, gender]]) });

describe("placeByLeague", () => {
  it("places by the player's league", () => {
    expect(run("a", ["L2"], "Male")).toBe("Men::A");
    expect(run("b", ["L4"], "Male")).toBe("Men::B");
  });
  it("uses gender to split a shared league", () => {
    expect(run("c", ["L5"], "Male")).toBe("Men::B");
    expect(run("d", ["L5"], "Female")).toBe("Ladies");
  });
  it("leaves ambiguous or unmatched players unplaced", () => {
    expect(run("e", ["L5"], null)).toBe("");
    expect(run("f", ["L2", "L4"], "Male")).toBe("");
    expect(run("g", ["L9"], "Male")).toBe("");
  });
});

  it("uses explicit type instead of a misleading label, including a single unit", () => {
    const typed = [{ key: "Division::A", base: "Division › A", categoryType: "ladies" as const }];
    const place = (gender: string | null) => placeByLeague({ memberId: "p", units: typed, eligOf: () => ({ mode: "all", leagueIds: [] }), leaguesByMember: new Map(), genderByMember: new Map([["p", gender]]) });
    expect(place("Female")).toBe("Division::A");
    expect(place("Male")).toBe("");
    expect(place(null)).toBe("");
  });
