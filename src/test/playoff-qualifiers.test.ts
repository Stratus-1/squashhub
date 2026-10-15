import { describe, it, expect } from "vitest";
import { playoffEstimate, splitBands, legacyPlayoffMirror } from "@/lib/smart-builder/playoff-qualifiers";

describe("row playoff qualifiers", () => {
  it("knockout top 8 of 24 with 3rd place; rest finish on standings", () => {
    const e = playoffEstimate({ kind: "knockout", scope: "top_n", topN: 8, thirdPlace: true }, 24)!;
    expect(e.bands[0]).toMatchObject({ bracket: 8, byes: 0, matches: 8 });
    expect(e.finishOnStandings).toEqual({ from: 9, to: 24 });
    expect(e.preview).toMatch(/not ranked by playoff matches/);
    expect(e.issues).toEqual([]);
  });
  it("knockout non-power-of-two gives byes to top seeds", () => {
    const e = playoffEstimate({ kind: "knockout", scope: "top_n", topN: 6 }, 18)!;
    expect(e.bands[0]).toMatchObject({ bracket: 8, byes: 2, matches: 5 });
  });
  it("ranking all entrants in bands 1-8, 9-16, 17-24", () => {
    const e = playoffEstimate({ kind: "ranking", scope: "all", bands: splitBands(24, 8) }, 24)!;
    expect(e.bands.map((b) => b.matches)).toEqual([12, 12, 12]);
    expect(e.finishOnStandings).toBeNull();
    expect(e.issues).toEqual([]);
  });
  it("ranking top 16 with non-qualifiers as a separate band of 7 (byes)", () => {
    const e = playoffEstimate({ kind: "ranking", scope: "top_n", topN: 16, nonQualifiers: "band" }, 23)!;
    expect(e.bands.map((b) => [b.from, b.to, b.byes])).toEqual([[1, 16, 0], [17, 23, 1]]);
    expect(e.finishOnStandings).toBeNull();
  });
  it("flags invalid Top N and gapped bands", () => {
    expect(playoffEstimate({ kind: "knockout", scope: "top_n", topN: 30 }, 16)!.issues.length).toBeGreaterThan(0);
    expect(playoffEstimate({ kind: "ranking", scope: "all", bands: [{ from: 1, to: 8 }, { from: 10, to: 16 }] }, 16)!.issues.join()).toMatch(/follow on/);
    expect(playoffEstimate({ kind: "none", scope: "all" }, 16)).toBeNull();
  });
  it("mirrors to legacy playoff fields", () => {
    expect(legacyPlayoffMirror({ kind: "ranking", scope: "top_n", topN: 8 }, 24)).toMatchObject({ choice: "playoffs", rounds: 3, style: "placement" });
  });
});
