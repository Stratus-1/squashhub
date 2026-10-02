import { describe, it, expect } from "vitest";
import { recommendPools, reviewPools, balancedSizes, poolPlanOf, poolQualificationOf } from "@/lib/smart-builder/pool-plan";
import { drawPlanOf, buildDrawSpec, previewDraw } from "@/lib/smart-builder/step-draw";
import { buildPlayoffChain } from "@/lib/smart-builder/playoff-chain";

describe("recommendPools", () => {
  it("balances around the preferred size", () => {
    expect(recommendPools(10, 5)).toEqual([5, 5]);
    expect(recommendPools(18, 5)).toEqual([5, 5, 4, 4]);
    expect(recommendPools(7, 5)).toEqual([7]);
    expect(recommendPools(12, 5)).toEqual([6, 6]);
  });
  it("avoids tiny pools", () => {
    expect(recommendPools(5, 2).every((s) => s >= 2)).toBe(true);
    expect(Math.min(...recommendPools(13, 3))).toBeGreaterThanOrEqual(3);
  });
  it("balanced sizes are biggest first", () => {
    expect(balancedSizes(18, 4)).toEqual([5, 5, 4, 4]);
  });
});

describe("reviewPools", () => {
  it("states the recommendation from actual entrants", () => {
    const r = reviewPools({ mode: "auto", target: "5" }, "Men's A", 18, "player");
    expect(r.line).toBe("Men's A has 18 players. Recommended: 4 pools — 5, 5, 4, 4.");
    expect(r.needsDecision).toBe(false);
  });
  it("Decide after entries close needs an organiser decision", () => {
    expect(reviewPools({ mode: "later" }, "Men's A", 10, "player").needsDecision).toBe(true);
  });
  it("No pools never changes, but warns on a large round robin", () => {
    const r = reviewPools({ mode: "none" }, "Men's A", 16, "player");
    expect(r.recommended).toEqual([]);
    expect(r.warnings[0]).toMatch(/120 games/);
  });
});

describe("lowest-group pool setup and saved-plan compatibility", () => {
  it("keeps category-only rules and subcategory overrides distinct", () => {
    const plan = { poolPlan: { Men: { mode: "auto", target: "5", perPool: "2" }, "Men::A": { mode: "none" }, Ladies: { mode: "later" } } };
    expect(poolPlanOf(plan, "Men")?.mode).toBe("auto");
    expect(poolPlanOf(plan, "Men::A")?.mode).toBe("none");
    expect(poolPlanOf(plan, "Men::B")?.target).toBe("5");
    expect(poolPlanOf(plan, "Ladies")?.mode).toBe("later");
  });
  it("reads legacy pool qualifiers until a new Playoffs answer overrides them", () => {
    const legacy = { poolPlan: { Men: { mode: "auto", target: "5", perPool: "2", runnersUp: "0" } } };
    expect(poolQualificationOf(legacy, "Men::A")).toEqual({ perPool: "2", runnersUp: "0" });
    const changed = { ...legacy, playoffPoolQualifiers: { "Men::A": { perPool: "1", runnersUp: "0" } } };
    expect(poolQualificationOf(changed, "Men::A").perPool).toBe("1");
    expect(drawPlanOf(changed).playoffPoolQualifiers).toEqual(changed.playoffPoolQualifiers);
    expect(poolQualificationOf(changed, "Men::B").perPool).toBe("2");
  });
});

describe("play-offs from several pools", () => {
  const plan = (pairing: string) => ({ pairing, mode: "scheduled", date: "2026-11-02", deadline: null, from: null, to: null, courtIds: [], trigger: "confirm" } as any);
  const main = { id: "v-main", order: 0, kind: "pools", pools: 4, poolMembers: [["a","b","c","d","e"],["f","g","h","i","j"],["k","l","m","n"],["o","p","q","r"]] } as any;
  it("top 2 of 4 pools, crossover: winner v next pool runner-up", () => {
    const r = buildPlayoffChain(main, "v", [{ name: "QF", plan: plan("crossover") }, { name: "SF", plan: plan("winners") }, { name: "F", plan: plan("winners") }], { qualifiers: { perPool: 2, runnersUp: 0 } });
    expect(r.reason).toBeNull();
    const m = r.stages[0].mapping!.matches.map((x) => `${x.a}v${x.b}`);
    expect(m).toEqual(["A1vB2", "B1vC2", "C1vD2", "D1vA2"]);
  });
  it("blocks a qualifier count that doesn't fill the bracket", () => {
    const r = buildPlayoffChain(main, "v", [{ name: "SF", plan: plan("seeded") }, { name: "F", plan: plan("winners") }], { qualifiers: { perPool: 2, runnersUp: 0 } });
    expect(r.reason).toMatch(/needs 4 qualifiers/);
  });
  it("seeded top 1 of 4 pools into semifinals", () => {
    const r = buildPlayoffChain(main, "v", [{ name: "SF", plan: plan("seeded") }, { name: "F", plan: plan("winners") }], { qualifiers: { perPool: 1, runnersUp: 0 } });
    expect(r.reason).toBeNull();
    expect(r.stages[0].mapping!.matches.map((x) => `${x.a}v${x.b}`)).toEqual(["A1vD1", "B1vC1"]);
  });
  it("best runners-up is not guessed", () => {
    const r = buildPlayoffChain(main, "v", [{ name: "SF", plan: plan("seeded") }, { name: "F", plan: plan("winners") }], { qualifiers: { perPool: 1, runnersUp: 2 } });
    expect(r.reason).toMatch(/best runners-up/);
  });
});
