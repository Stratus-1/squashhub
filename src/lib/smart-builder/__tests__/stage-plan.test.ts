import { describe, it, expect } from "vitest";
import { type PlanAnswers, resolveStagePlan, setCategoryStagePlan, setStartingDefault, deriveStageStatus, validateStagePlan, planImpact, recommendSwissRounds, type StagePlanItem } from "../stage-plan";

const swiss5: StagePlanItem = { id: "s1", kind: "swiss", rounds: 5, advance: { mode: "all_continue" } };

describe("stage plan — backward compatibility", () => {
  it("derives Stage 1 from legacy format, confirmed rounds win", () => {
    const r = resolveStagePlan({ format: { kind: "swiss", swissRounds: "6", swissRoundsConfirmed: "5" } }, "Mens B");
    expect(r.stages).toHaveLength(1);
    expect(r.stages[0]).toMatchObject({ kind: "swiss", rounds: 5 });
    expect(r.source).toBe("default");
  });
  it("legacy override and parent category inheritance", () => {
    const a = { format: { kind: "swiss", swissRounds: "5" }, formatOverrides: { "Mens A": { kind: "round_robin" } } };
    expect(resolveStagePlan(a, "Mens A::1")).toMatchObject({ source: "category", stages: [{ kind: "round_robin" }] });
    expect(resolveStagePlan({}, "X").source).toBe("unset");
  });
});

describe("stage plan — saving", () => {
  it("writes Stage 1 back to formatOverrides and keeps later stages", () => {
    const a = setCategoryStagePlan<PlanAnswers>({ format: { kind: "swiss", swissRounds: "5" } }, "Mens B", [{ ...swiss5, endAfterRound: 4 }, { id: "s2", kind: "round_robin" }]);
    expect(a.formatOverrides?.["Mens B"]).toMatchObject({ kind: "swiss", swissRoundsConfirmed: "4" });
    expect(resolveStagePlan(a, "Mens B").stages.map((s) => s.kind)).toEqual(["swiss", "round_robin"]);
  });
  it("Stage 1 equal to the default stores no redundant override", () => {
    const a = setCategoryStagePlan<PlanAnswers>({ format: { kind: "swiss", swissRounds: "5" } }, "Ladies A", [swiss5, { id: "s2", kind: null }]);
    expect(a.formatOverrides?.["Ladies A"]).toBeUndefined();
    expect(a.stagePlans?.["Ladies A"]).toHaveLength(2);
  });
  it("starting default keeps legacy format in step", () => {
    expect(setStartingDefault<PlanAnswers>({}, "swiss", 5).format).toMatchObject({ kind: "swiss", swissRounds: "5", swissRoundsConfirmed: "5" });
  });
});

describe("stage plan — status and validation", () => {
  const games = [
    { stageIndex: 0, round: 1, decided: true }, { stageIndex: 0, round: 2, decided: true },
    { stageIndex: 0, round: 3, decided: false },
  ];
  it("derives active round from games", () => {
    expect(deriveStageStatus(swiss5, 0, games)).toEqual({ state: "active", currentRound: 3, playedRounds: 2 });
    expect(deriveStageStatus(swiss5, 1, games).state).toBe("planned");
  });
  it("blocks changing a drawn stage's format and ending before played rounds", () => {
    const gen = [{ index: 0, kind: "swiss", maxPlayedRound: 3, maxGeneratedRound: 4 }];
    expect(validateStagePlan([{ ...swiss5, kind: "round_robin" }], { generated: gen }).some((i) => i.level === "error")).toBe(true);
    expect(validateStagePlan([{ ...swiss5, endAfterRound: 2 }], { generated: gen }).some((i) => /already been played/.test(i.message))).toBe(true);
    expect(validateStagePlan([{ ...swiss5, endAfterRound: 4 }, { id: "s2", kind: "round_robin" }], { generated: gen }).filter((i) => i.level === "error")).toEqual([]);
  });
  it("undecided later stage is allowed", () => {
    expect(validateStagePlan([swiss5, { id: "s2", kind: null }]).filter((i) => i.level === "error")).toEqual([]);
  });
});

describe("stage plan — impact preview", () => {
  const fx = [
    { id: "a", stageIndex: 0, round: 4, decided: true, hasBooking: true, scheduled: true },
    { id: "b", stageIndex: 0, round: 5, decided: false, hasBooking: true, scheduled: true },
    { id: "c", stageIndex: 0, round: 5, decided: false, hasBooking: false, scheduled: true },
  ];
  it("end Swiss after R4 + add RR: lists only unplayed R5, never played games", () => {
    const imp = planImpact([swiss5], [{ ...swiss5, endAfterRound: 4 }, { id: "s2", kind: "round_robin" }], fx);
    expect(imp.withdraw.map((f) => f.id)).toEqual(["b", "c"]);
    expect(imp.keepBookings).toBe(1);
    expect(imp.protectedPlayed).toBe(1);
    expect(imp.drawLater[0]).toMatch(/Stage 2/);
  });
  it("no change → no impact", () => {
    expect(planImpact([swiss5], [swiss5], fx)).toMatchObject({ changed: false, withdraw: [] });
  });
  it("recommendation is advisory text only", () => {
    expect(recommendSwissRounds(12)).toBe("4–5 rounds");
    expect(recommendSwissRounds(2)).toBeNull();
  });
});
