import { describe, it, expect } from "vitest";
import { swissStandingsStatus } from "@/lib/tournaments/swiss-round-gate";
const g = (round: number, done: boolean, bye = false) => ({ a: "x", b: bye ? null : "y", round, status: done ? "completed" : "scheduled", winner: done ? "x" : null });
describe("swissStandingsStatus", () => {
  it("not started", () => { expect(swissStandingsStatus([], 6).state).toBe("not_started"); expect(swissStandingsStatus([g(1, false)], 6).state).toBe("not_started"); });
  it("in progress", () => expect(swissStandingsStatus([g(1, true), g(1, false)], 6)).toMatchObject({ state: "in_progress", round: 1, done: 1, of: 2 }));
  it("after round, byes final", () => expect(swissStandingsStatus([g(1, true), g(1, false, true)], 6)).toMatchObject({ state: "after_round", round: 1, total: 6 }));
  it("next round created but not underway", () => expect(swissStandingsStatus([g(1, true), g(2, false)], 6)).toMatchObject({ state: "after_round", round: 1 }));
  it("final", () => expect(swissStandingsStatus([g(1, true), g(2, true)], 2).state).toBe("final"));
});
