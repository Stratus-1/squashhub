import { describe, expect, it } from "vitest";
import { evaluateStructures, materiallyDifferent } from "./structure-guide";

const top = (n: number, o: any, s: any, t: any, isChamps = false) => evaluateStructures({ n, outcome: o, strength: s, time: t, isChamps })[0];

describe("structure guide", () => {
  it("club champs ranking 20 players favours pools + positional playoffs over Swiss", () => {
    const r = top(20, "rank", "broad", "some", true);
    expect(r.kind).toBe("pools");
    expect(r.playoff).toBe("placement");
  });
  it("winner quickly with tight time favours knockout", () => {
    expect(top(20, "winner", null, "tight").kind).toBe("knockout");
  });
  it("large field, similar strength, constrained → Swiss", () => {
    expect(top(32, "balanced", "similar", "some").kind).toBe("swiss");
  });
  it("small field ranking → round robin", () => {
    expect(top(6, "rank", "broad", "plenty").kind).toBe("round_robin");
  });
  it("estimates round demand", () => {
    const rr = evaluateStructures({ n: 6, outcome: "rank", strength: null, time: "plenty" }).find((x) => x.kind === "round_robin")!;
    expect(rr.matches).toBe(15);
    expect(rr.rounds).toBe(5);
  });
  it("material difference", () => {
    expect(materiallyDifferent(20, 12)).toBe(true);
    expect(materiallyDifferent(20, 18)).toBe(false);
    expect(materiallyDifferent(4, 6)).toBe(false);
  });
});

describe("structure guide capacity", () => {
  it("6 ladies, club champs ranking, ample capacity → round robin not knockout", () => {
    const r = evaluateStructures({ n: 6, outcome: "rank", strength: null, time: null, isChamps: true, slots: 40, matchMinutes: 45 });
    expect(r[0].kind).toBe("round_robin");
    expect(r[0].matches).toBe(15);
    expect(r[0].fit).toBe("fits");
    expect(r[0].courtHours).toBe(11.3);
  });
  it("capacity too small pushes away from round robin", () => {
    const r = evaluateStructures({ n: 6, outcome: "rank", strength: null, time: null, isChamps: true, slots: 6 });
    expect(r[0].kind).not.toBe("round_robin");
  });
  it("computes capacity and shares", async () => {
    const { guideCapacity, shareSlots } = await import("./structure-guide");
    expect(guideCapacity({ courts: "3", hoursPerCourt: "4", sessionDays: "2", matchMinutes: "45" })).toEqual({ courtHours: 24, slots: 32, matchMinutes: 45 });
    expect(guideCapacity({ time: "some" })).toBeNull();
    const s = shareSlots({ A: 6, B: 6 }, 30);
    expect(s.A + s.B).toBeLessThanOrEqual(30);
  });
});

describe("pool costing per pool size", () => {
  it("costs each pool from its own players, not the pool count", async () => {
    const { poolCandidate, poolStageText } = await import("./structure-guide");
    const c = poolCandidate(24, 4, true); // 4 pools of 6
    expect(c.pools).toEqual([6, 6, 6, 6]);
    expect(c.poolRounds).toEqual([5, 5, 5, 5]);
    expect(c.prelimMatches).toBe(60);
    expect(c.rounds).toBe(5);
    const c5 = poolCandidate(10, 2, true);
    expect(c5.poolRounds).toEqual([5, 5]);
    expect(c5.prelimMatches).toBe(20);
    expect(poolCandidate(8, 2, true).prelimMatches).toBe(12);
    expect(poolStageText(c)).toMatch(/4 pools, each played as a round robin — 4 × 6 players \(15 matches, 5 rounds each\)/);
  });
  it("ranking with ample capacity favours fewer, larger pools over many small ones", () => {
    const r = evaluateStructures({ n: 28, outcome: "rank", strength: null, time: null, isChamps: true, slots: 200 }).find((x) => x.kind === "pools")!;
    expect(r.pools!.length).toBeLessThanOrEqual(4);
    expect(r.matches).toBe(r.prelimMatches + r.playoffMatches);
  });
  it("tight capacity shrinks pools to fit", () => {
    const r = evaluateStructures({ n: 28, outcome: "rank", strength: null, time: null, isChamps: true, slots: 70 }).find((x) => x.kind === "pools")!;
    expect(r.fit).not.toBe("exceeds");
  });
});
