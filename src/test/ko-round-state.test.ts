import { describe, expect, it } from "vitest";
import { koRoundState, milestoneFor, pacePlan, playoffSteps, roundsLeftFor } from "@/lib/tournaments/paced-knockout";

const plan = { playoffSync: true, stages: [
  { phase: "main", name: "Round 1", deadline: "2026-10-10" },
  { phase: "main", name: "Round 2", deadline: "2026-10-13" },
  { phase: "main", name: "Round 3", deadline: "2026-10-16" },
  { phase: "main", name: "Round 4", deadline: "2026-10-19" },
  { phase: "playoff", name: "Quarterfinals", date: "2026-10-21" },
  { phase: "playoff", name: "Semifinals", date: "2026-10-23" },
  { phase: "playoff", name: "Final", date: "2026-10-25" },
] };
const run = (active: number, today: string, lastRound = 1) => {
  const m = milestoneFor(plan, "Mens::1st");
  const reached = active <= m.fieldSize!;
  const p = pacePlan({ active, target: reached ? null : m.fieldSize, roundsLeft: reached ? null : roundsLeftFor(m, lastRound), pace: "paced" });
  return koRoundState({ active, nextRound: lastRound + 1, milestone: m, steps: playoffSteps(plan, "Mens::1st"), plan: p, today });
};

describe("knockout round state machine", () => {
  it("Masters 9 active after R1 proposes Round 2 with one match", () => {
    expect(run(9, "2026-10-04")).toEqual({ kind: "pre_round", label: "Round 2", count: 1 });
  });
  it("8 active with QF target 8 waits for the formal Quarterfinal stage", () => {
    expect(run(8, "2026-10-04")).toMatchObject({ kind: "waiting_for_stage", stage: "Quarterfinals", date: "2026-10-21", reason: "field_ready" });
  });
  it("6 active is never called a Quarter-final early", () => {
    expect(run(6, "2026-10-04")).toMatchObject({ kind: "waiting_for_stage", reason: "no_elimination_needed" });
  });
  it("Quarterfinal opens after the last pre-QF round date", () => {
    expect(run(8, "2026-10-20")).toEqual({ kind: "playoff", label: "Quarterfinals", count: 4 });
    expect(run(6, "2026-10-20")).toEqual({ kind: "playoff", label: "Quarterfinals", count: 2 });
  });
  it("SF and Final follow results", () => {
    expect(run(4, "2026-10-22", 6)).toEqual({ kind: "playoff", label: "Semifinals", count: 2 });
    expect(run(2, "2026-10-24", 7)).toEqual({ kind: "playoff", label: "Final", count: 1 });
  });
});
