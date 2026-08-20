import { describe, expect, it } from "vitest";
import {
  allTreeLeagueIds,
  buildLeagueTree,
  filterLeagueTree,
  groupSelectionState,
  isReserveLeague,
  levelFromName,
  summarizeTreeSelection,
  toggleChild,
  toggleGroup,
} from "@/lib/tournaments/league-tree";

const leagues = [
  { id: "a", name: "Acacia Thorns", association_id: "A", assocName: "NIL" },
  { id: "b", name: "Apex Eagles", association_id: "A", assocName: "NIL" },
  { id: "c", name: "Cobras", association_id: "A", assocName: "NIL" },
  { id: "r1", name: "1st L Reserves", association_id: "A", assocName: "NIL" },
  { id: "x", name: "Wanderers", association_id: "A", assocName: "NIL" },
];

const tiers = new Map<string, string>([
  ["a", "1st League"],
  ["b", "1st League"],
  ["c", "2nd League"],
]);

describe("league tree", () => {
  it("groups teams under their league level", () => {
    const tree = buildLeagueTree(leagues, tiers);
    const first = tree.find((g) => g.label === "1st League")!;
    expect(first.children.map((c) => c.id).sort()).toEqual(["a", "b", "r1"]);
    expect(tree.find((g) => g.label === "2nd League")!.children).toHaveLength(1);
  });

  it("attaches reserves to the parent league and flags them", () => {
    const tree = buildLeagueTree(leagues, tiers);
    const first = tree.find((g) => g.label === "1st League")!;
    const reserves = first.children.find((c) => c.id === "r1")!;
    expect(reserves.isReserve).toBe(true);
    // reserves sort last
    expect(first.children[first.children.length - 1].id).toBe("r1");
  });

  it("keeps unplaceable leagues visible as their own group", () => {
    const tree = buildLeagueTree(leagues, tiers);
    expect(allTreeLeagueIds(tree).sort()).toEqual(["a", "b", "c", "r1", "x"]);
    expect(tree.find((g) => g.label === "Wanderers")!.children).toHaveLength(1);
  });

  it("creates a level group when no fixtures exist at all", () => {
    const tree = buildLeagueTree([{ id: "r3", name: "3rd L Reserves", assocName: "NIL" }], new Map());
    expect(tree[0].label).toBe("3rd League");
    expect(tree[0].children[0].isReserve).toBe(true);
  });

  it("reports parent state including indeterminate", () => {
    const tree = buildLeagueTree(leagues, tiers);
    const first = tree.find((g) => g.label === "1st League")!;
    expect(groupSelectionState(first, [])).toBe("none");
    expect(groupSelectionState(first, ["a"])).toBe("some");
    expect(groupSelectionState(first, ["a", "b", "r1"])).toBe("all");
  });

  it("parent toggle selects/clears all children, children toggle alone", () => {
    const tree = buildLeagueTree(leagues, tiers);
    const first = tree.find((g) => g.label === "1st League")!;
    const on = toggleGroup(first, []);
    expect(on.sort()).toEqual(["a", "b", "r1"]);
    expect(toggleGroup(first, on)).toEqual([]);
    // partial → select all
    expect(toggleGroup(first, ["a"]).sort()).toEqual(["a", "b", "r1"]);
    expect(toggleChild("r1", on).sort()).toEqual(["a", "b"]);
  });

  it("searches league names and team names", () => {
    const tree = buildLeagueTree(leagues, tiers);
    expect(filterLeagueTree(tree, "1st").map((g) => g.label)).toContain("1st League");
    const byTeam = filterLeagueTree(tree, "cobra");
    expect(byTeam).toHaveLength(1);
    expect(byTeam[0].children.map((c) => c.id)).toEqual(["c"]);
  });

  it("summarises selection as leagues + teams", () => {
    const tree = buildLeagueTree(leagues, tiers);
    expect(summarizeTreeSelection(tree, []).text).toBe("No teams selected");
    expect(summarizeTreeSelection(tree, ["a", "b", "c"]).text).toBe("2 leagues, 3 teams selected");
  });

  it("detects reserve naming and league levels", () => {
    expect(isReserveLeague("2nd Reserves")).toBe(true);
    expect(isReserveLeague("Apex Eagles")).toBe(false);
    expect(levelFromName("4th League")).toBe(4);
    expect(levelFromName("Second League")).toBe(2);
    expect(levelFromName("Baobabs")).toBeNull();
  });
});
