import { describe, expect, it } from "vitest";
import { DefinitionSchema, type TournamentDefinition } from "@/lib/smart-builder/definition";
import { mapToExistingTournament } from "@/lib/smart-builder/to-existing";
import { setupSwissRounds, swissDivisionProgress, categoryKeyOf } from "@/lib/tournaments/swiss-progress";
import { unitKeyOf } from "@/lib/smart-builder/step-draw";

/** Phase 2 (Riverside pilot): Swiss round count per category, never one tournament-wide number. */
const cats = [
  { id: "ma", name: "Men's A", n: 10, rounds: 4 },
  { id: "mb", name: "Men's B", n: 15, rounds: 5 },
  { id: "mc", name: "Men's C", n: 24, rounds: 6 },
];
const def = (): TournamentDefinition => DefinitionSchema.parse({
  name: "Synthetic Riverside Swiss",
  divisions: cats.map((c) => ({
    id: c.id, name: c.name, eligibility: "men",
    sections: [{ id: `${c.id}_s`, name: "Main", stages: [{ id: `${c.id}_sw`, name: "Swiss", kind: "swiss", discipline: "singles", groups: 1, groupSize: c.n, swissRounds: c.rounds, input: {}, advance: { role: "seed" } }] }],
  })),
});

describe("builder → tournament mapping", () => {
  it("pilot ON: each category keeps its own count, keyed by game group", () => {
    const m = mapToExistingTournament(def(), { perCategorySwissRounds: true });
    expect(m.champ.swiss_rounds).toEqual({ "1": 4, "2": 5, "3": 6 });
    expect(m.champ.expected_players).toEqual({ "1": 10, "2": 15, "3": 24 });
  });
  it("pilot OFF: legacy single value unchanged (existing behaviour preserved)", () => {
    expect(mapToExistingTournament(def()).champ.swiss_rounds).toBe(6);
  });
  it("persist → reload keeps independent settings", () => {
    const saved = JSON.parse(JSON.stringify(mapToExistingTournament(def(), { perCategorySwissRounds: true }).champ));
    expect(saved.swiss_rounds["1"]).toBe(4);
    expect(saved.swiss_rounds["2"]).toBe(5);
    expect(saved.swiss_rounds["3"]).toBe(6);
  });
});

describe("setup lookup by stable category key", () => {
  const setup = JSON.parse(JSON.stringify({
    format: { swissRounds: 3 },
    formatOverrides: { "Men's A": { swissRoundsConfirmed: 4 }, "Men's AB": { swissRounds: 7 }, "Men's B": { swissRounds: 5 }, "Men's C": { swissRounds: 6 } },
  }));
  it("matches the builder's own key format", () => {
    for (const l of ["Mens › A · Singles", "Men's A", "Ladies › B · Doubles"]) expect(categoryKeyOf(l)).toBe(unitKeyOf(l));
  });
  it("each category reads only its own count (10/15/24 players)", () => {
    expect(setupSwissRounds(setup, "Men's A · Singles", { byKey: true })).toBe(4);
    expect(setupSwissRounds(setup, "Men's B · Singles", { byKey: true })).toBe(5);
    expect(setupSwissRounds(setup, "Men's C · Singles", { byKey: true })).toBe(6);
  });
  it("no name-prefix mix-ups: Men's AB never borrows Men's A", () => {
    expect(setupSwissRounds(setup, "Men's AB", { byKey: true })).toBe(7);
    expect(setupSwissRounds({ formatOverrides: { "Men's A": { swissRounds: 4 } }, format: { swissRounds: 3 } }, "Men's AB", { byKey: true })).toBe(3);
  });
  it("subcategory falls back to its parent category, then tournament default", () => {
    expect(setupSwissRounds({ formatOverrides: { Mens: { swissRounds: 5 } }, format: { swissRounds: 3 } }, "Mens › A · Singles", { byKey: true })).toBe(5);
    expect(setupSwissRounds({ format: { swissRounds: 3 } }, "Ladies", { byKey: true })).toBe(3);
  });
  it("pilot OFF keeps the legacy prefix lookup unchanged", () => {
    expect(setupSwissRounds({ formatOverrides: { "Men's A": { swissRounds: 4 } } }, "Men's AB")).toBe(4);
  });
  it("categories progress independently (A in round 4 while B in round 2)", () => {
    const st = (r: number) => [{ id: "s", kind: "swiss", swissRounds: r }];
    const fx = (round: number) => Array.from({ length: round }, (_, i) => ({ a: "x", b: "y", round: i + 1, status: "completed", winner: "x" }));
    const rows = swissDivisionProgress(
      [{ divisionId: "a", label: "Men's A", stages: st(4) }, { divisionId: "b", label: "Men's B", stages: st(5) }],
      (di) => di === 0 ? fx(4) : fx(2), [], setup, { byKey: true });
    expect(rows.map((r) => [r.swissRounds, r.current.round, r.gate.state])).toEqual([[4, 4, "finished"], [5, 2, "ready"]]);
  });
});
