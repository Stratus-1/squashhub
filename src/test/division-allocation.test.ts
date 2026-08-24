import { describe, it, expect } from "vitest";
import { allocateEntrantsToDivisions } from "@/lib/tournaments/divisions";

const sources = {
  "1": { mode: "selected" as const, leagueIds: ["L1"] },
  "2": { mode: "selected" as const, leagueIds: ["L2"] },
};

const regs = new Map<string, string[]>([
  ["L1", ["alice"]],
  ["L2", ["susan"]],
]);

describe("allocateEntrantsToDivisions", () => {
  it("places players in the division matching their real league", () => {
    const r = allocateEntrantsToDivisions({
      entrantIds: ["alice", "susan"],
      numDivisions: 2,
      sources,
      registrationsByLeague: regs,
    });
    expect(r.assignments.get("alice")).toBe(0);
    expect(r.assignments.get("susan")).toBe(1);
    expect(r.unassigned).toEqual([]);
  });

  it("leaves open-invite acceptors with no source league unassigned", () => {
    const r = allocateEntrantsToDivisions({
      entrantIds: ["alice", "bob"],
      numDivisions: 2,
      sources,
      registrationsByLeague: regs,
    });
    expect(r.assignments.has("bob")).toBe(false);
    expect(r.unassigned).toEqual(["bob"]);
  });

  it("keeps manual placements", () => {
    const r = allocateEntrantsToDivisions({
      entrantIds: ["susan"],
      numDivisions: 2,
      sources,
      registrationsByLeague: regs,
      existing: new Map([["susan", 0]]),
    });
    expect(r.assignments.get("susan")).toBe(0);
  });

  it("uses an all-leagues division as catch-all", () => {
    const r = allocateEntrantsToDivisions({
      entrantIds: ["bob"],
      numDivisions: 2,
      sources: { "1": { mode: "selected", leagueIds: ["L1"] }, "2": { mode: "all", leagueIds: [] } },
      registrationsByLeague: regs,
    });
    expect(r.assignments.get("bob")).toBe(1);
    expect(r.unassigned).toEqual([]);
  });
});

describe("locked entrants", () => {
  const sources = { "1": { mode: "selected", leagueIds: ["L1"] }, "2": { mode: "selected", leagueIds: ["L2"] } } as any;
  const regs = new Map<string, string[]>([["L1", ["a"]], ["L2", ["b"]]]);

  it("keeps a locked entrant in their chosen division even if not eligible there", () => {
    const { assignments, unassigned } = allocateEntrantsToDivisions({
      entrantIds: ["a"],
      numDivisions: 2,
      sources,
      registrationsByLeague: regs,
      existing: new Map([["a", 1]]),
      locked: new Set(["a"]),
    });
    expect(assignments.get("a")).toBe(1);
    expect(unassigned).toEqual([]);
  });

  it("never redrafts a locked entrant whose division disappeared", () => {
    const { assignments, unassigned } = allocateEntrantsToDivisions({
      entrantIds: ["b"],
      numDivisions: 1,
      sources,
      registrationsByLeague: regs,
      existing: new Map([["b", 1]]),
      locked: new Set(["b"]),
    });
    expect(assignments.has("b")).toBe(false);
    expect(unassigned).toEqual(["b"]);
  });

  it("still auto-allocates unlocked entrants", () => {
    const { assignments } = allocateEntrantsToDivisions({
      entrantIds: ["b"],
      numDivisions: 2,
      sources,
      registrationsByLeague: regs,
      locked: new Set(["a"]),
    });
    expect(assignments.get("b")).toBe(1);
  });
});
