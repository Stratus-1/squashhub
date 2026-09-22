import { describe, it, expect } from "vitest";
import { DIAMOND_LEAGUE_PRESET, presetToMaps } from "@/lib/tournaments/presets";
import { followsDivision, pairingMethodFor, stageOrder, pairFromOrder } from "@/lib/tournaments/stage-sequence";

describe("Diamond League preset", () => {
  const maps = presetToMaps(DIAMOND_LEAGUE_PRESET);

  it("creates a singles stage followed by a doubles stage", () => {
    expect(maps.numGroups).toBe(2);
    expect(maps.matchTypes["1"]).toBe("singles");
    expect(maps.matchTypes["2"]).toBe("doubles");
    expect(followsDivision(maps.follows, 2)).toBe(1);
    expect(followsDivision(maps.follows, 1)).toBeNull();
  });

  it("uses timed scoring with 20 then 30 minute games", () => {
    expect(maps.scoringModes["1"]).toBe("time_capped_points");
    expect(maps.scoringModes["2"]).toBe("time_capped_points");
    expect(maps.durations["1"]).toBe(20);
    expect(maps.durations["2"]).toBe(30);
    expect(maps.matchDuration).toBe(20);
  });

  it("pairs neighbours from the finishing order", () => {
    expect(pairingMethodFor(maps.pairing, 2)).toBe("adjacent");
    const { pairs, unpaired } = pairFromOrder(["p1", "p2", "p3", "p4", "p5", "p6"], "adjacent");
    expect(unpaired).toEqual([]);
    expect(pairs).toEqual([
      { a: "p5", b: "p6" },
      { a: "p3", b: "p4" },
      { a: "p1", b: "p2" },
    ]);
  });

  it("orders the stages singles first", () => {
    expect(stageOrder([1, 2], maps.follows)).toEqual([1, 2]);
  });
});
