import { describe, it, expect } from "vitest";
import { divisionScoringColumns } from "@/lib/smart-builder/step-handover";
import { effectiveTournamentSettings } from "@/lib/tournaments/effective-settings";

describe("setup scoring → live tournament columns", () => {
  it("copies Bells onto every division so result entry is time-capped", () => {
    const cols = divisionScoringColumns([
      { scoring: { mode: "time_capped_points", pointsPerGame: 11, bestOf: 5, winCondition: "win_by_2" } },
      { scoring: { mode: "time_capped_points", pointsPerGame: 11, bestOf: 5, winCondition: "win_by_2" } },
    ]);
    expect(cols.league_scoring_modes).toEqual({ 1: "time_capped_points", 2: "time_capped_points" });
    expect(effectiveTournamentSettings(cols, 2).scoringMode).toBe("time_capped_points");
  });
  it("Bells 10+3 gives a 13-minute slot with a 10-minute bell", async () => {
    const { BellsFormat } = await import("@/lib/tournament-formats/bells");
    const cols: any = divisionScoringColumns([{ scoring: { mode: "time_capped_points", slotMinutes: 13, breakMinutes: 3 } }]);
    expect(cols.group_durations).toEqual({ 1: 13 });
    expect(BellsFormat.getTimeCapMinutes({ ...cols, match_duration_minutes: 30 } as any, 1)).toBe(10);
  });
  it("per-category overrides stay per division", () => {
    const cols = divisionScoringColumns([{ scoring: { mode: "standard", pointsPerGame: 15, bestOf: 3 } }, { scoring: null }]);
    expect(cols.league_scoring_modes).toEqual({ 1: "standard" });
    expect(cols.league_best_of).toEqual({ 1: 3 });
  });
  it("no scoring answered leaves columns untouched", () => {
    expect(divisionScoringColumns([{ scoring: null }])).toEqual({});
  });
});
