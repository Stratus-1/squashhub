import { describe, it, expect } from "vitest";
import { monradPlan, monradNote } from "@/lib/smart-builder/monrad";
import { stageMatches } from "@/lib/smart-builder/structure-capacity";
import { validateStagePlan, stageKindLabel } from "@/lib/smart-builder/stage-plan";
import { FORMAT_HELP, baseFormatOf } from "@/lib/smart-builder/format-help";

describe("Monrad positional draw", () => {
  it("8-player draw: 3 rounds, 12 matches, no byes", () => {
    expect(monradPlan(8)).toMatchObject({ bracket: 8, byes: 0, rounds: 3, matches: 12, matchesPerRound: [4, 4, 4] });
  });
  it("16-player draw: 4 rounds, 32 matches", () => {
    expect(monradPlan(16)).toMatchObject({ bracket: 16, byes: 0, rounds: 4, matches: 32 });
  });
  it("non-power-of-two fields pad with byes and never count bye matches", () => {
    expect(monradPlan(6)).toMatchObject({ bracket: 8, byes: 2, rounds: 3, matchesPerRound: [2, 3, 3] });
    expect(monradPlan(12)).toMatchObject({ bracket: 16, byes: 4, matchesPerRound: [4, 6, 6, 6] });
    expect(monradPlan(5)!.matchesPerRound[0]).toBe(1);
    expect(monradNote(6)).toMatch(/2 byes/);
  });
  it("rejects fields below 2", () => { expect(monradPlan(1)).toBeNull(); });
  it("capacity and validation treat monrad as a non-eliminating stage", () => {
    expect(stageMatches({ id: "a", kind: "monrad" }, 8)).toBe(12);
    const plan = [{ id: "a", kind: "swiss" as const, rounds: 5, advance: { mode: "all_continue" as const } }, { id: "b", kind: "monrad" as const, advance: { mode: "none" as const } }];
    expect(validateStagePlan(plan, { entrants: 16 }).filter((x) => x.level === "error")).toEqual([]);
    expect(stageKindLabel("monrad")).toBe("Monrad (positional draw)");
  });
  it("base format list is clean: legacy pools maps to round robin help", () => {
    expect(Object.keys(FORMAT_HELP).sort()).toEqual(["knockout", "monrad", "round_robin", "swiss"]);
    expect(baseFormatOf("pools")).toBe("round_robin");
    expect(baseFormatOf(null)).toBeNull();
  });
});
