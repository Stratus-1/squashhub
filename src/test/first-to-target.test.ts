import { describe, expect, it } from "vitest";
import { FirstToTargetFormat, targetWinner } from "@/lib/tournament-formats/first-to-target";
import { divisionScoringColumns } from "@/lib/smart-builder/step-handover";
import { effectiveTournamentSettings } from "@/lib/tournaments/effective-settings";
import { inheritedScoringForGroup } from "@/lib/tournaments/stage-scoring";
import { rankPoolTally, roundRobin } from "@/lib/tournaments/contract";
import type { StandingsRow, StandingsStats } from "@/lib/tournament-formats/types";

describe("First to target", () => {
  it("6–6 is unfinished and 7–6 wins without a two-point lead", () => {
    expect(targetWinner(6, 6, 7)).toBeNull();
    expect(targetWinner(7, 6, 7)).toBe("a");
    expect(targetWinner(6, 7, 7)).toBe("b");
  });
  it("honours a different configured target", () => {
    expect(targetWinner(8, 8, 9)).toBeNull();
    expect(targetWinner(8, 9, 9)).toBe("b");
  });
  it("round-trips target seven, one game and sudden death into marker and playoffs", () => {
    const cols = divisionScoringColumns([{ scoring: { mode: "first_to_target", pointsPerGame: 7 } }]);
    const effective = effectiveTournamentSettings(cols, 1);
    expect(effective.pointsPerGame).toBe(7);
    expect(effective.bestOf).toBe(1);
    expect(effective.winCondition).toBe("sudden_death");
    expect(effective.playAllGames).toBe(false);
    expect(inheritedScoringForGroup(cols, 1, "Test")).toMatchObject({ ok: true, mode: "first_to_target", pointsPerGame: 7, bestOf: 1 });
  });
  it("awards exactly one standings point for a win and zero for a loss irrespective of rally totals", () => {
    const blank = (): StandingsStats => ({ played: 0, won: 0, lost: 0, gamesWon: 0, gamesLost: 0, byes: 0, pointsFor: 0, pointsAgainst: 0 });
    const a = blank(), b = blank();
    const match = { player_a_member_id: "a", player_b_member_id: "b", winner_member_id: "a", score: "7-6", game_scores: JSON.stringify([{ a: 7, b: 6 }]) };
    FirstToTargetFormat.applyMatchToStats(a, match, "a", false);
    FirstToTargetFormat.applyMatchToStats(b, match, "b", false);
    const column = FirstToTargetFormat.standingsColumns[0];
    expect(column.render({ ...a, points: 999 } as StandingsRow)).toBe("1");
    expect(column.render({ ...b, points: 999 } as StandingsRow)).toBe("0");
    expect(FirstToTargetFormat.rankStandings({ ...a, pointsFor: 7 } as StandingsRow, { ...b, pointsFor: 100 } as StandingsRow)).toBeLessThan(0);
  });
  it("reuses two six-player round robins and win-based qualification without cross-pool games", () => {
    const pools = [Array.from({ length: 6 }, (_, i) => `a${i}`), Array.from({ length: 6 }, (_, i) => `b${i}`)];
    for (const pool of pools) {
      const fixtures = roundRobin(pool);
      expect(fixtures.flat().length).toBe(15);
      expect(rankPoolTally(new Map(pool.map((id, i) => [id, 5 - i])), 2, "Synthetic").slice(0, 2)).toEqual(pool.slice(0, 2));
    }
  });
});