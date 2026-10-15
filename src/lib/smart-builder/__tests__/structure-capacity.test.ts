import { describe, it, expect } from "vitest";
import { unitCapacity, courtLoad } from "../structure-capacity";

const a = {
  format: { kind: "swiss", swissRounds: "5" },
  stagePlans: {
    "Mens A": [{ id: "1", kind: "swiss" as const, rounds: 5, advance: { mode: "top_n" as const, topN: 8 } }, { id: "2", kind: "round_robin" as const }],
    "Mens B": [{ id: "1", kind: "swiss" as const, rounds: 4 }],
    "Ladies A": [{ id: "1", kind: "pools" as const, pools: 4, advance: { mode: "per_pool" as const, perPool: 2 } }, { id: "2", kind: "knockout" as const }],
    "Mens C": [{ id: "1", kind: "swiss" as const, rounds: 5, endAfterRound: 4 }, { id: "2", kind: null }],
  },
};

describe("structure capacity", () => {
  it("Mens A 24 Swiss 5 → top 8 round robin", () => {
    const c = unitCapacity(a, "Mens A", 24);
    expect(c.stages.map((s) => s.matches)).toEqual([60, 28]);
    expect(c.undecided).toBe(0);
  });
  it("Mens B 18 Swiss 4", () => expect(unitCapacity(a, "Mens B", 18).matches).toBe(36));
  it("Ladies A 16 in 4 pools → top 2 knockout", () => {
    const c = unitCapacity(a, "Ladies A", 16);
    expect(c.stages.map((s) => s.matches)).toEqual([24, 7]);
  });
  it("stage change after rounds: Swiss ended after R4 + undecided stage counted as uncertainty", () => {
    const c = unitCapacity(a, "Mens C", 12);
    expect(c.matches).toBe(24);
    expect(c.nextUndecided).toBe(1);
  });
  it("legacy answers without stage plans fall back to the default", () => expect(unitCapacity(a, "Ladies B", 10).matches).toBe(25));
  it("court load", () => {
    expect(courtLoad(60, 45).needHours).toBe(45);
    expect(courtLoad(60, 45, { courts: 3, sessions: 5, sessionMinutes: 180 }).fits).toBe(true);
  });
});
