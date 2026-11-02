import { describe, expect, it } from "vitest";
import { drawPlanOf } from "@/lib/smart-builder/step-draw";
import { timelinePlayoffSpec } from "@/lib/smart-builder/attach-timeline-playoffs";
import { placeholderGames } from "@/lib/smart-builder/playoff-placeholders";
import { plannedPlayoffBracket } from "@/lib/tournaments/planned-playoff-bracket";
import { resolvePlayoffSessions } from "@/lib/smart-builder/playoff-schedule";
import { isProvisionalSwissSlot } from "@/lib/tournaments/fixture-split";
const plan = { originalStructure: { _unit_keys: ["Mens A", "Ladies B"], league_planned_playoff_rounds: { "1": ["sf", "final", "third"], "2": ["sf", "final", "third"] } }, stages: ["Mens A", "Ladies B"].flatMap((unit) => [
  { unit, phase: "playoff", name: "Semifinal", mode: "play_by", deadline: "2026-11-12", pairing: "crossover" },
  { unit, phase: "playoff", name: "Final", mode: "scheduled", date: "2026-11-21", from: "09:15", to: "13:15", courtIds: [27, 36], pairing: "winners" },
]) };
const division = (label: string, groupNumber: number) => ({ divisionId: `g${groupNumber}`, groupNumber, label, stages: [
  { id: "v-main", order: 0, kind: "round_robin", name: "Round robin" },
  { id: "v-po1", order: 1, kind: "mapped", name: "Semifinal", mapping: { source: "stage_standings", sourceStageId: "v-main", matches: [{ a: "A1", b: "B2", order: 1 }, { a: "B1", b: "A2", order: 2 }] } },
  { id: "v-po2", order: 2, kind: "mapped", name: "Final", schedule: { rule: "play_by", deadline: "2026-11-21" }, mapping: { source: "stage_winners", sourceStageId: "v-po1", matches: [{ a: "A1", b: "A2", order: 1 }], units: [{ id: "A1", slots: [{ pool: 0, position: 1 }] }, { id: "A2", slots: [{ pool: 0, position: 2 }] }] } },
] });
describe("late Uitsig placement finals", () => {
  const spec: any = { divisions: [division("Mens A", 1), division("Ladies B", 6)] };
  it("retains the saved third/fourth selections in the shared draw plan", () => expect(drawPlanOf(plan).originalStructure).toEqual(plan.originalStructure));
  it("adds exactly one loser final per category without altering existing stages", () => {
    const next = timelinePlayoffSpec(spec, plan);
    expect(next?.divisions.map((d) => d.stages.filter((s) => s.mapping?.losers).length)).toEqual([1, 1]);
    for (let i = 0; i < 2; i++) expect(next?.divisions[i].stages.filter((s) => !s.mapping?.losers)).toEqual(spec.divisions[i].stages);
    expect(timelinePlayoffSpec(next, plan)).toBeNull();
  });
  it("uses semifinal losers, never winners, for the placement fixture", () => {
    const next = timelinePlayoffSpec(spec, plan);
    const d = next?.divisions[0];
    expect(d && placeholderGames(d).find((g) => g.stageName === "3rd place")).toMatchObject({ a: "Loser SF1", b: "Loser SF2" });
  });
  it("refreshes stale play-by final sessions from the saved 21 November times and courts", () => {
    const next = timelinePlayoffSpec(spec, plan);
    if (!next) throw new Error("missing stages");
    const sessions = resolvePlayoffSessions(next, plan.stages);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].schedule).toMatchObject({ date: "2026-11-21", timeFrom: "09:15", timeTo: "13:15", courtIds: [27, 36] });
    expect(sessions[0].keys).toHaveLength(4);
  });
  it("shows the placement bracket before the Final", () => {
    const rows = plannedPlayoffBracket(plan, "Ladies B", 2, null);
    expect(rows.map((r) => r.stage)).toEqual(["Semifinal", "Semifinal", "3rd place", "Final"]);
    expect(rows[2].sides.map((s) => s.label)).toEqual(["Loser SF1", "Loser SF2"]);
  });
  it("does not hide play-off placeholders as Swiss games in a mixed-format tournament", () => {
    expect(isProvisionalSwissSlot({ stage: "playoff_final", stage_key: "v-po2#ph" }, { scoring_mode: "swiss" })).toBe(false);
    expect(isProvisionalSwissSlot({ stage: "group", stage_key: "v-main" }, { scoring_mode: "swiss" })).toBe(true);
  });
});