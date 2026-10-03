import { describe, it, expect } from "vitest";
import { milestoneFor, playoffSteps, koRoundState, pacePlan, configuredPathText, activeField } from "@/lib/tournaments/paced-knockout";

const po = (name: string, date: string, unit?: string) => ({ name, phase: "playoff", mode: "scheduled", date, ...(unit ? { unit } : {}) });
const rounds = [{ name: "Round 1", phase: "main", mode: "play_by", deadline: "2026-10-10" }, { name: "Round 2", phase: "main", mode: "play_by", deadline: "2026-10-13" }];
const KEY = "Masters::Singles";
const state = (plan: any, active: number, today = "2026-10-11", nextRound = 2) => {
  const m = milestoneFor(plan, KEY);
  const target = m.fieldSize != null && active > m.fieldSize ? m.fieldSize : null;
  return koRoundState({ active, nextRound, milestone: m, steps: playoffSteps(plan, KEY), plan: pacePlan({ active, target, roundsLeft: 1, pace: "paced", milestoneLabel: m.label }), today });
};

describe("optional formal play-off stages", () => {
  const full = { stages: [...rounds, po("Quarterfinal", "2026-10-21"), po("Semifinal", "2026-10-22"), po("Final", "2026-10-26")] };
  const noQf = { stages: [...rounds, po("Semifinal", "2026-10-22"), po("Final", "2026-10-26")] };
  const finalOnly = { stages: [...rounds, po("Final", "2026-10-26")] };

  it("A: QF → SF → Final paces to 8", () => {
    expect(milestoneFor(full, KEY)).toMatchObject({ label: "Quarterfinal", fieldSize: 8 });
    expect(playoffSteps(full, KEY).map((s) => s.label)).toEqual(["Quarterfinal", "Semifinal", "Final"]);
  });
  it("B: without QF the target is 4 and no QF appears anywhere", () => {
    expect(milestoneFor(noQf, KEY)).toMatchObject({ label: "Semifinal", fieldSize: 4, date: "2026-10-22" });
    expect(playoffSteps(noQf, KEY).map((s) => s.label)).toEqual(["Semifinal", "Final"]);
    expect(configuredPathText(noQf, KEY, "Pool knockout")).toBe("Pool knockout → Semifinal → Final");
    const s = state(noQf, 6);
    expect(s).toMatchObject({ kind: "pre_round" });
    expect(JSON.stringify(s)).not.toMatch(/quarter/i);
  });
  it("C: Final-only targets 2 finalists", () => {
    expect(milestoneFor(finalOnly, KEY)).toMatchObject({ label: "Final", fieldSize: 2 });
    expect(state(finalOnly, 2, "2026-10-20")).toMatchObject({ kind: "playoff", label: "Final", count: 1 });
  });
  it("D: reaching the target early waits for the first configured stage, never a QF", () => {
    expect(state(noQf, 4)).toEqual({ kind: "waiting_for_stage", stage: "Semifinal", date: "2026-10-22", reason: "field_ready" });
  });
  it("E: shared QF removed → linked categories target the next existing shared stage; own stages still win", () => {
    expect(milestoneFor({ ...noQf, playoffSync: true }, KEY).label).toBe("Semifinal");
    const own = { stages: [...noQf.stages, po("Final", "2026-10-24", "Masters")] };
    expect(milestoneFor(own, KEY)).toMatchObject({ source: "own", label: "Final" });
    // Once open, the first remaining stage takes the qualification survivors.
    expect(state(noQf, 4, "2026-10-14")).toMatchObject({ kind: "playoff", label: "Semifinal", count: 2 });
  });
  it("F: played results are only read, never rewritten", () => {
    const rows = [{ round_number: 1, player_a_member_id: "a", player_b_member_id: "b", winner_member_id: "a", status: "completed" }];
    const snap = JSON.stringify(rows);
    const f = activeField([{ id: "a" }, { id: "b" }, { id: "c" }] as any, rows as any);
    expect(f.eliminated.map((e: any) => e.id ?? e)).toContain("b");
    expect(JSON.stringify(rows)).toBe(snap);
  });
});
