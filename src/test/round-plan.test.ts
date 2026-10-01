import { describe, it, expect } from "vitest";
import {
  roundsForPool, openingRoundsNeeded, playoffRoundsFor, playoffTypeFor,
  openingRoundsWarning, playoffDeadline, isPlayoffGame, type DivisionShape,
} from "@/lib/tournaments/round-plan";
import { deadlineForStage } from "@/lib/tournaments/round-deadlines";

const pools2x4 = (mode: string, q = 2): DivisionShape => ({
  label: "Men A", format: "single_round_robin", poolSizes: [4, 4], playoffs: true, playoffMode: mode, qualifiersPerPool: q,
});

describe("round plan", () => {
  it("counts round-robin rounds", () => {
    expect(roundsForPool(4)).toBe(3);
    expect(roundsForPool(5)).toBe(5);
    expect(roundsForPool(4, { double: true })).toBe(6);
    expect(openingRoundsNeeded([pools2x4("position"), { ...pools2x4("position"), format: "double_round_robin" }])).toBe(6);
  });

  it("asks only for the play-off rounds that apply", () => {
    expect(playoffRoundsFor([pools2x4("position")]).map((r) => r.key)).toEqual(["place_playoffs"]);
    expect(playoffTypeFor(pools2x4("knockout", 2))).toBe("crossover");
    const cross = playoffRoundsFor([pools2x4("knockout", 2)]);
    expect(cross.map((r) => r.key)).toEqual(["semi_final", "final"]);
    expect(cross[0].name).toBe("Crossover semi-finals");
    expect(playoffRoundsFor([pools2x4("knockout", 4)]).map((r) => r.key)).toEqual(["quarter_final", "semi_final", "final"]);
    expect(playoffRoundsFor([{ ...pools2x4("position"), playoffs: false }])).toEqual([]);
  });

  it("warns when the round count looks wrong", () => {
    expect(openingRoundsWarning(3, 3)).toBeNull();
    expect(openingRoundsWarning(3, 6)).toMatch(/need 6/);
    expect(openingRoundsWarning(4, 3)).toMatch(/empty/);
  });

  it("never dates a play-off with a pool round's date", () => {
    const pools = [{ label: "Round 1", date: "2026-10-05" }, { label: "Round 2", date: "2026-10-12" }];
    const label = "Group B · Pos 2 · 3rd/4th Place Play-off";
    expect(deadlineForStage(pools, 1, label)).toBeNull();
    expect(deadlineForStage(pools, 1, label, { place_playoffs: "2026-10-26" })).toBe("2026-10-26");
    expect(deadlineForStage(pools, 1, "Group C · Semi-final", { semi_final: "2026-10-26" })).toBe("2026-10-26");
    expect(deadlineForStage(pools, 2, "Round 2")).toBe("2026-10-12");
    expect(playoffDeadline({ final: "2026-10-30" }, "Group C · 3rd Place Play-off", "playoff_3rd")).toBe("2026-10-30");
    expect(isPlayoffGame({ stage: "playoff_final" })).toBe(true);
    expect(isPlayoffGame({ stage: "group" })).toBe(false);
  });
});
