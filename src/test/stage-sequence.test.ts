import { describe, expect, it } from "vitest";
import {
  divisionStageState,
  followsDivision,
  pairFromOrder,
  pairingMethodFor,
  poolMinutes,
  stageOrder,
  wouldCycle,
} from "@/lib/tournaments/stage-sequence";

const ORDER6 = ["p1", "p2", "p3", "p4", "p5", "p6"];

describe("pairFromOrder", () => {
  it("pairs neighbours from the bottom (Durbanville: 6+5, 4+3, 2+1)", () => {
    const { pairs, unpaired } = pairFromOrder(ORDER6, "adjacent");
    expect(pairs).toEqual([
      { a: "p5", b: "p6" },
      { a: "p3", b: "p4" },
      { a: "p1", b: "p2" },
    ]);
    expect(unpaired).toEqual([]);
  });

  it("pairs strongest with weakest when balanced", () => {
    const { pairs } = pairFromOrder(ORDER6, "balanced");
    expect(pairs).toEqual([
      { a: "p1", b: "p6" },
      { a: "p2", b: "p5" },
      { a: "p3", b: "p4" },
    ]);
  });

  it("handles eight players", () => {
    const eight = [...ORDER6, "p7", "p8"];
    expect(pairFromOrder(eight, "adjacent").pairs).toHaveLength(4);
    expect(pairFromOrder(eight, "balanced").pairs).toHaveLength(4);
  });

  it("reports the odd player out instead of dropping them", () => {
    const five = ORDER6.slice(0, 5);
    const adjacent = pairFromOrder(five, "adjacent");
    expect(adjacent.pairs).toEqual([
      { a: "p4", b: "p5" },
      { a: "p2", b: "p3" },
    ]);
    expect(adjacent.unpaired).toEqual(["p1"]);
    expect(pairFromOrder(five, "balanced").unpaired).toEqual(["p3"]);
  });

  it("decides nothing for manual pairing", () => {
    const manual = pairFromOrder(ORDER6, "manual");
    expect(manual.pairs).toEqual([]);
    expect(manual.unpaired).toEqual(ORDER6);
  });
});

describe("stage settings", () => {
  it("defaults to adjacent pairing and no dependency", () => {
    expect(pairingMethodFor(null, 2)).toBe("adjacent");
    expect(pairingMethodFor({ "2": "balanced" }, 2)).toBe("balanced");
    expect(followsDivision(null, 2)).toBeNull();
    expect(followsDivision({ "2": 1 }, 2)).toBe(1);
    expect(followsDivision({ "2": 2 }, 2)).toBeNull();
  });

  it("refuses a dependency loop", () => {
    expect(wouldCycle({ "1": 2 }, 2, 1)).toBe(true);
    expect(wouldCycle({}, 2, 1)).toBe(false);
  });

  it("orders stages so a follower never runs first", () => {
    expect(stageOrder([1, 2], { "1": 2 })).toEqual([2, 1]);
    expect(stageOrder([1, 2, 3], {})).toEqual([1, 2, 3]);
  });

  it("locks a follower until its stage is complete", () => {
    const locked = divisionStageState({
      groupNumber: 2,
      follows: { "2": 1 },
      completeByDivision: { 1: false },
      labels: { 1: "Singles" },
    });
    expect(locked.unlocked).toBe(false);
    expect(locked.reason).toContain("Singles");

    const open = divisionStageState({
      groupNumber: 2,
      follows: { "2": 1 },
      completeByDivision: { 1: true },
    });
    expect(open.unlocked).toBe(true);
  });
});

describe("poolMinutes", () => {
  it("prefers the pool override, then the division, then the default", () => {
    expect(
      poolMinutes({
        poolDurations: { "2:1": 30 },
        groupDurations: { "2": 20 },
        groupNumber: 2,
        pool: 1,
        fallbackMinutes: 45,
      }),
    ).toBe(30);
    expect(
      poolMinutes({ groupDurations: { "2": 20 }, groupNumber: 2, pool: 2, fallbackMinutes: 45 }),
    ).toBe(20);
    expect(poolMinutes({ groupNumber: 3, pool: 1, fallbackMinutes: 45 })).toBe(45);
    expect(poolMinutes({ groupNumber: 3, pool: 1 })).toBeNull();
  });
});
