import { describe, it, expect } from "vitest";
import { plannedPlayoffsByUnit, syncPlayoffStages } from "@/lib/smart-builder/structure-playoffs";

const st = (id: string, name: string, unit = "", phase = "playoff") => ({ id, name, unit, phase, date: "2026-11-14" });
const make = (name: string, unit: string) => st("new-" + name + unit, name, unit);

describe("structure planned playoffs drive scheduling stages", () => {
  const planned = plannedPlayoffsByUnit({ _unit_keys: ["Mens A 2", "Ladies B"], league_planned_playoff_rounds: { "1": ["sf", "final"], "2": ["qf", "sf", "final"] } })!;
  it("quarterfinal only for ladies, semis and final shared", () => {
    const out = syncPlayoffStages([st("r1", "Round 1", "", "main"), st("q", "Quarterfinal"), st("s", "Semifinal"), st("f", "Final")], planned, make);
    const po = out.filter((s) => s.phase === "playoff");
    expect(po.map((s) => [s.id, s.name, s.unit])).toEqual([["q", "Quarterfinal", "Ladies B"], ["s", "Semifinal", ""], ["f", "Final", ""]]);
    expect(po[0].date).toBe("2026-11-14");
  });
  it("adds missing rounds automatically", () => {
    const out = syncPlayoffStages([], planned, make).map((s) => [s.name, s.unit]);
    expect(out).toEqual([["Quarterfinal", "Ladies B"], ["Semifinal", ""], ["Final", ""]]);
  });
  it("removes rounds nobody plays", () => {
    const p2 = plannedPlayoffsByUnit({ _unit_keys: ["A", "B"], league_planned_playoff_rounds: { "1": ["final"], "2": ["final"] } })!;
    expect(syncPlayoffStages([st("q", "Quarterfinals"), st("f", "Final")], p2, make).map((s) => s.id)).toEqual(["f"]);
  });
});
