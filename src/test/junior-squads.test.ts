import { describe, it, expect } from "vitest";
import { groupSquads, moveTarget, type SquadRow } from "@/lib/juniors/squads";

const row = (p: Partial<SquadRow>): SquadRow => ({
  member_id: "m", club_id: "c", club_name: "Nelspruit", name: "A", age: 14,
  auto_gender_group: "boys", auto_age_group: "U15", age_source: "age",
  gender_group: "boys", age_group: "U15", moved: false, junior_player: true, junior_source: "sportyhq", has_person: true, ...p,
});

describe("junior squads", () => {
  it("places a junior in their saved (moved) group, not the automatic one", () => {
    const g = groupSquads([row({ age_group: "U17", moved: true })]);
    expect(g.boys.U17).toHaveLength(1);
    expect(g.boys.U15).toHaveLength(0);
  });
  it("keeps juniors without boy/girl or age group out of the age columns", () => {
    const g = groupSquads([row({ gender_group: null, age_group: null })]);
    expect(g.unknown.none).toHaveLength(1);
  });
  it("dropping on the automatic group resets the move", () => {
    expect(moveTarget(row({ age_group: "U17", moved: true }), "boys", "U15")).toEqual({ kind: "reset" });
  });
  it("dropping on another group saves a move", () => {
    expect(moveTarget(row({}), "boys", "U17")).toEqual({ kind: "move", gender: "boys", age: "U17" });
  });
  it("dropping on the current group does nothing", () => {
    expect(moveTarget(row({}), "boys", "U15")).toEqual({ kind: "noop" });
  });
});
