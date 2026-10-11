import { describe, it, expect } from "vitest";
import { effectiveSwissRounds, swissConfirmIssues, swissProgression } from "@/lib/smart-builder/swiss-progression";
import { setupSwissRounds } from "@/lib/tournaments/swiss-progress";

const po = (n: string, unit = "") => ({ name: n, phase: "playoff", unit });
describe("Swiss estimate vs confirmed rounds", () => {
  it("confirmed wins over estimate; estimate is fallback", () => {
    expect(effectiveSwissRounds({ swissRounds: "6", swissRoundsConfirmed: "5" })).toBe(5);
    expect(effectiveSwissRounds({ swissRounds: "6" })).toBe(6);
    expect(setupSwissRounds({ format: { swissRounds: "6", swissRoundsConfirmed: "5" } }, "Mens A")).toBe(5);
    expect(setupSwissRounds({ format: { swissRounds: "6" }, formatOverrides: { "Mens A": { swissRounds: "6", swissRoundsConfirmed: "4" } } }, "Mens A · Singles")).toBe(4);
  });
  it("preflight blocks lowering below generated rounds and over-limit counts", () => {
    expect(swissConfirmIssues("5", { generatedRounds: 5, completedRounds: 5 })).toEqual([]);
    expect(swissConfirmIssues("4", { generatedRounds: 5 })[0]).toMatch(/Round 5 already exists/);
    expect(swissConfirmIssues("16", { entrants: 16 })[0]).toMatch(/at most 15/);
    expect(swissConfirmIssues("x")[0]).toMatch(/whole number/);
  });
});
describe("stage progression preview", () => {
  it("lists only configured stages incl. user-added Final, top 8 standard seeding", () => {
    const p = swissProgression({ swissRoundsConfirmed: "5" }, [{ name: "Round 1", phase: "main" }, po("Quarterfinal"), po("Semifinal"), po("Final")]);
    expect(p.steps).toEqual(["5 Swiss rounds", "Top 8", "Quarterfinal", "Semifinal", "Final"]);
    expect(p.bracket).toEqual(["Quarterfinal 1: 1 v 8", "Quarterfinal 2: 4 v 5", "Quarterfinal 3: 2 v 7", "Quarterfinal 4: 3 v 6"]);
    expect(p.issues).toEqual([]);
  });
  it("never invents a Final; flags duplicates and broken chains", () => {
    expect(swissProgression({ swissRounds: "5" }, [po("Quarterfinal"), po("Semifinal")]).steps).toEqual(["5 Swiss rounds (estimate)", "Top 8", "Quarterfinal", "Semifinal"]);
    expect(swissProgression({}, [po("Final"), po("Final")]).issues.join()).toMatch(/more than once/);
    expect(swissProgression({}, [po("Quarterfinal"), po("Final")]).issues.join()).toMatch(/does not follow/);
    expect(swissProgression({}, [po("Plate")]).qualifiers).toBeNull();
  });
});
