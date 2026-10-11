import { describe, it, expect } from "vitest";
import { inheritedScoringForGroup, inheritedStageScoring } from "@/lib/tournaments/stage-scoring";
import { effectiveTournamentSettings } from "@/lib/tournaments/effective-settings";

const t = {
  league_scoring_modes: { "1": "standard", "2": "standard", "3": "time_capped_points" },
  league_points_per_game: { "1": 11, "2": 15 },
  league_best_of: { "1": 5, "2": 3 },
};
const spec: any = { divisions: [
  { divisionId: "a", name: "Men's A", stages: [{ id: "sw", order: 1, kind: "swiss" }, { id: "qf", order: 2 }, { id: "sf", order: 3 }, { id: "f", order: 4 }] },
  { divisionId: "l", name: "Ladies", stages: [{ id: "rr", order: 1, kind: "pools" }, { id: "sf", order: 2 }, { id: "f", order: 3 }] },
  { divisionId: "b", name: "Bells", stages: [{ id: "rr", order: 1 }] },
] };

describe("play-off stages inherit category scoring", () => {
  it("QF, SF and Final of one category all resolve the same saved values the marker uses", () => {
    const r = inheritedStageScoring(t, spec, "a");
    expect(r).toMatchObject({ ok: true, text: "PAR 11 · Best of 5", categoryName: "Men's A" });
    const m = effectiveTournamentSettings(t, (r as any).groupNumber);
    expect([m.pointsPerGame, m.bestOf]).toEqual([11, 5]);
  });
  it("categories with different settings stay separate (pool→KO too)", () => {
    expect(inheritedStageScoring(t, spec, "l")).toMatchObject({ ok: true, text: "PAR 15 · Best of 3" });
    expect(inheritedStageScoring(t, spec, "b")).toMatchObject({ ok: true, text: "Bells (time-capped points)" });
  });
  it("blocks missing or invalid values instead of guessing", () => {
    expect(inheritedScoringForGroup({}, 1, "X").ok).toBe(false);
    expect(inheritedScoringForGroup({ scoring_mode: "standard", points_per_game: 11 }, 1, "X")).toMatchObject({ ok: false, issue: expect.stringMatching(/best-of/) });
    expect(inheritedScoringForGroup({ scoring_mode: "standard", points_per_game: 9, best_of: 5 }, 1, "X")).toMatchObject({ ok: false, issue: expect.stringMatching(/invalid/) });
  });
  it("falls back to explicit tournament-wide values", () => {
    expect(inheritedScoringForGroup({ scoring_mode: "standard", points_per_game: 15, best_of: 5 }, 4, "X")).toMatchObject({ ok: true, text: "PAR 15 · Best of 5" });
  });
});
