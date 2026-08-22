import { describe, it, expect } from "vitest";
import { sortDivisionEntrants, seedPreview, isUnranked } from "@/lib/tournaments/seeding";

const p = (id: string, ladder: number | null) => ({ id, name: id, ladder_position: ladder });

describe("division seeding", () => {
  it("orders by club ladder ascending", () => {
    const out = sortDivisionEntrants([p("a", 10), p("b", 25), p("c", 3), p("d", 12)]);
    expect(out.map((x) => x.ladder_position)).toEqual([3, 10, 12, 25]);
  });

  it("keeps unranked entrants but places them last", () => {
    const out = sortDivisionEntrants([p("nolan", null), p("c", 3)]);
    expect(out.map((x) => x.id)).toEqual(["c", "nolan"]);
    expect(isUnranked(out[1])).toBe(true);
  });

  it("does not dedupe a player across divisions (same rank reused)", () => {
    const d1 = sortDivisionEntrants([p("x", 9), p("y", 4)]);
    const d2 = sortDivisionEntrants([p("x", 9), p("z", 20)]);
    expect(d1.find((e) => e.id === "x")!.ladder_position).toBe(9);
    expect(d2.find((e) => e.id === "x")!.ladder_position).toBe(9);
  });

  it("honours a deliberate manual order only when flagged", () => {
    const players = [p("a", 10), p("c", 3)];
    expect(sortDivisionEntrants(players, { manualOrder: ["a", "c"] }).map((x) => x.id)).toEqual(["c", "a"]);
    expect(
      sortDivisionEntrants(players, { manual: true, manualOrder: ["a", "c"] }).map((x) => x.id),
    ).toEqual(["a", "c"]);
  });

  it("builds a seed preview with the ladder rank behind each seed", () => {
    const out = seedPreview(sortDivisionEntrants([p("a", 10), p("b", null), p("c", 3)]));
    expect(out).toEqual([
      { seed: 1, id: "c", name: "c", ladderPosition: 3, unranked: false },
      { seed: 2, id: "a", name: "a", ladderPosition: 10, unranked: false },
      { seed: 3, id: "b", name: "b", ladderPosition: null, unranked: true },
    ]);
  });
});
