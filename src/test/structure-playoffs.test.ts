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

import { buildPlayoffChain } from "@/lib/smart-builder/playoff-chain";
describe("play-off continues from an existing knockout stage", () => {
  it("final after a two-game semifinal is played by the semifinal winners", () => {
    const sf: any = { id: "v-po1", order: 1, kind: "mapped", name: "Semifinal", discipline: "singles",
      mapping: { source: "stage_standings", sourceStageId: "v-main", pools: 2, poolSize: 4, units: [], matches: [{ a: "A1", b: "B2", round: 1, order: 1 }, { a: "B1", b: "A2", round: 1, order: 2 }] } };
    const r = buildPlayoffChain(sf, "v", [{ name: "Final", plan: { mode: "scheduled", date: "2026-11-14", trigger: "auto", pairing: "later" } as any }]);
    expect(r.reason).toBeNull();
    expect(r.stages[0].id).toBe("v-po2");
    expect(r.stages[0].mapping?.source).toBe("stage_winners");
    expect(r.stages[0].mapping?.matches.length).toBe(1);
  });
});

import { syncPlayoffStages as syncQ } from "@/lib/smart-builder/structure-playoffs";
describe("adding a quarterfinal keeps the saved pairing", () => {
  it("moves the semifinal's crossover to the new quarterfinal; later stages follow winners", () => {
    const st = [
      { id: "sf", name: "Semifinal", unit: "M", phase: "playoff", pairing: "crossover" },
      { id: "f", name: "Final", unit: "M", phase: "playoff", pairing: "winners" },
    ];
    const out = syncQ(st, { M: ["qf", "sf", "final"] }, (n, u) => ({ id: "qf", name: n, unit: u, phase: "playoff", pairing: "later" }));
    expect(Object.fromEntries(out.map((s) => [s.name, s.pairing]))).toEqual({ Quarterfinal: "crossover", Semifinal: "winners", Final: "winners" });
  });
  it("never invents a pairing when none was saved", () => {
    const out = syncQ([{ id: "sf", name: "Semifinal", unit: "M", phase: "playoff", pairing: "later" }], { M: ["qf", "sf"] }, (n, u) => ({ id: "qf", name: n, unit: u, phase: "playoff", pairing: "later" }));
    expect(out.map((s) => s.pairing)).toEqual(["later", "later"]);
  });
});
