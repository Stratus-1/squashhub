import { describe, expect, it } from "vitest";
import { swissRoundGate } from "@/lib/tournaments/swiss-round-gate";
import { nextSwissRound, generateFromSpec } from "@/lib/tournaments/engine-service";
import type { FixtureRow } from "@/lib/tournaments/contract";

const ids = Array.from({ length: 16 }, (_, i) => `p${i + 1}`);
const stage = (swissRounds = 6) => ({ id: "sw", order: 0, kind: "swiss", name: "Swiss rounds", swissRounds }) as any;
const division = (st = stage()) => ({ divisionId: "d1", label: "Men's A", unit: "players", entrants: ids.map((id) => ({ id })), stages: [st] }) as any;
const r1 = (done: number): FixtureRow[] => Array.from({ length: 8 }, (_, i) => ({
  id: `m${i}`, divisionId: "d1", stageId: "sw", stageKind: "swiss", round: 1, a: ids[i], b: ids[i + 8],
  status: i < done ? "completed" : "scheduled", winner: i < done ? ids[i] : null,
}));

describe("Swiss round gate", () => {
  it("draw generation creates Round 1 only", () => {
    const fx = generateFromSpec({ version: 1, architecture: "structured", name: "t", divisions: [division()] } as any, "t");
    expect(new Set(fx.map((f) => f.round))).toEqual(new Set([1]));
    expect(fx).toHaveLength(8);
  });

  it("blocks with progress until every real fixture is final", () => {
    const g = swissRoundGate(r1(6), 6);
    expect(g.state).toBe("in_progress");
    expect(g.message).toBe("6 of 8 matches complete; finish 2 remaining matches before generating Round 2.");
    expect(() => nextSwissRound("t", division(), "sw", r1(6))).toThrow(/6 of 8 matches complete/);
  });

  it("enables Round N+1 once complete; byes and voided games count as final", () => {
    const rows = r1(7);
    rows[7] = { ...rows[7], status: "completed", winner: null, score: "No result — both absent" };
    rows.push({ id: "bye", divisionId: "d1", stageId: "sw", stageKind: "swiss", round: 1, a: "x", b: null, status: "scheduled" });
    const g = swissRoundGate(rows, 6);
    expect(g).toMatchObject({ state: "ready", nextRound: 2 });
  });

  it("creates exactly the next round, never skipping", () => {
    const next = nextSwissRound("t", division(), "sw", r1(8));
    expect(next.every((f) => f.round === 2)).toBe(true);
    expect(next).toHaveLength(8);
  });

  it("offers final standings instead of another round after the last round", () => {
    const rows = r1(8).map((r) => ({ ...r }));
    expect(swissRoundGate(rows, 1)).toMatchObject({ state: "finished" });
    expect(() => nextSwissRound("t", division(stage(1)), "sw", rows)).toThrow(/complete/);
  });

  it("refuses when no round exists yet (Round 1 comes from the draw)", () => {
    expect(swissRoundGate([], 6).state).toBe("not_started");
    expect(() => nextSwissRound("t", division(), "sw", [])).toThrow();
  });
});
