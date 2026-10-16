import { describe, it, expect } from "vitest";
import { buildReplacementStage } from "@/lib/tournaments/replace-stage";
import { contractIssues, type PlannedStage } from "@/lib/tournaments/contract";

const swiss: PlannedStage = { id: "main", order: 0, kind: "swiss", name: "Swiss", swissRounds: 3, schedule: { rule: "fixed", date: "2026-10-29" } };
const rr: PlannedStage = { id: "s2", order: 1, kind: "pools", name: "Stage 2 · Pools", pools: 2, poolSize: 6, generation: "owner_approval",
  progression: { mode: "all_continue", standings: "reset" } as any, schedule: { rule: "fixed", date: "2026-10-29" } };

describe("replace an unplayed later stage", () => {
  it("round robin -> top 8 knockout keeps id/order/schedule and passes the contract", () => {
    const ko = buildReplacementStage(rr, { kind: "knockout", qualifiers: 8 }, 12);
    expect(ko).toMatchObject({ id: "s2", order: 1, kind: "knockout", drawSize: 8, schedule: rr.schedule });
    expect(ko.progression).toMatchObject({ mode: "top_n", top: 8 });
    const errs = contractIssues({ divisionId: "g1", unit: "players", expectedEntrants: 12, seeding: { source: null, method: null }, stages: [swiss, ko], placements: "champion" } as any)
      .filter((i) => i.level === "error");
    expect(errs).toEqual([]);
  });
  it("refuses more qualifiers than players, or a non-bracket size", () => {
    expect(() => buildReplacementStage(rr, { kind: "knockout", qualifiers: 16 }, 12)).toThrow();
    expect(() => buildReplacementStage(rr, { kind: "knockout", qualifiers: 6 }, 12)).toThrow();
  });
  it("back to round robin sizes pools from the players", () => {
    expect(buildReplacementStage(rr, { kind: "pools", pools: 3 }, 12)).toMatchObject({ kind: "pools", pools: 3, poolSize: 4 });
  });
});

describe("top and bottom brackets", () => {
  it("top 4 + bottom: 8 continue, bottom flag set", () => {
    const ko = buildReplacementStage(rr, { kind: "knockout", qualifiers: 4, bottomBracket: true }, 12);
    expect(ko).toMatchObject({ drawSize: 4, bottomBracket: true });
    expect(ko.progression).toMatchObject({ top: 8 });
  });
  it("refuses a bottom bracket without enough players", () => {
    expect(() => buildReplacementStage(rr, { kind: "knockout", qualifiers: 8, bottomBracket: true }, 12)).toThrow();
  });
});
