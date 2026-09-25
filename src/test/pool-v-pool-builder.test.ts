import { describe, it, expect } from "vitest";
import { emptyDefinition, type TournamentDefinition } from "@/lib/smart-builder/definition";
import { addStage, setFormat, setDiscipline, setSameSession, stageDetailLines } from "@/lib/smart-builder/stage-builder";
import { applyDiamondLeague, buildTies, snakeAllocate } from "@/lib/smart-builder/diamond-league";
import { opponentPositions, tieIssues, standardRubbers } from "@/lib/smart-builder/ties";
import { sessionPlan } from "@/lib/smart-builder/sessions";
import { scheduleMaths } from "@/lib/smart-builder/schedule-maths";
import { validateDefinition } from "@/lib/smart-builder/validate";

/** Build the Diamond League weekly structure using ONLY the builder's own control functions. */
function buildFromControls(): TournamentDefinition {
  const def = emptyDefinition();
  def.divisions = [{ id: "div1", name: "Division 1", eligibility: "open", entry: "individual", sections: [] } as any];
  const d = def.divisions[0];
  const s1id = addStage(d);
  const s1 = d.sections[0].stages[0];
  s1.groupSize = 6; s1.input = { entrants: 24 };
  setFormat(d, s1id, "cross_pool_league");
  s1.groups = 4; s1.tieFormat!.rubbers = standardRubbers("singles", 6, 20); s1.tieFormat!.pairing = "position"; s1.tieFormat!.startTime = "17:45";
  s1.schedule = { mode: "fixed", startDate: "2026-10-07", roundDates: ["2026-10-07", "2026-10-14", "2026-10-21"], weekday: 3 };
  const s2id = addStage(d);
  const s2 = d.sections[0].stages[1];
  s2.groupSize = 6;
  setFormat(d, s2id, "cross_pool_league"); s2.groups = 4;
  setDiscipline(d, s2id, "doubles");
  s2.tieFormat!.pairing = "position";
  setSameSession(d, s2id, true);
  d.poolGroups = [{ pools: [0, 1], court: "Court 1" }, { pools: [2, 3], court: "Court 2" }];
  def.scheduleDefaults = { startDate: "2026-10-07", endDate: "2026-11-04", weekday: 3 } as any;
  return def;
}

describe("Pool-v-pool league built from builder controls", () => {
  it("controls produce the Diamond weekly session: Singles 17:45–19:45 then Doubles 19:45–21:15", () => {
    const def = buildFromControls();
    const [s1, s2] = def.divisions[0].sections[0].stages;
    expect(s2.tieFormat?.rubbers.map((r) => r.positions)).toEqual([[1, 2], [3, 4], [5, 6]]);
    expect(s2.sameSessionAs).toBe(s1.id);
    expect(s2.schedule.roundDates).toEqual(s1.schedule.roundDates);
    const wk = sessionPlan(def).sessions;
    expect(wk).toHaveLength(3);
    expect(wk[0].minutes).toBe(210);
    expect(wk[0].parts.map((p) => [p.start, p.end])).toEqual([["17:45", "19:45"], ["19:45", "21:15"]]);
    expect(scheduleMaths(def).issues.filter((i) => ["dependency", "session"].includes(i.code))).toEqual([]);
    const v = validateDefinition(def).issues.filter((i) => i.code.startsWith("tie_") || i.code === "date_order");
    expect(v.filter((i) => i.level === "error")).toEqual([]);
  });
  it("Review describes the stage as a pool-v-pool league with rotation and pairing", () => {
    const def = applyDiamondLeague(emptyDefinition());
    const lines = stageDetailLines(def.divisions[0].sections[0].stages[0]);
    expect(lines).toContain("Pool rotation: round robin — each pool plays every other pool once");
    expect(lines).toContain("Pairing: position-to-position");
    expect(lines[0]).toBe("Pool-v-pool league · Singles");
    expect(lines.join(" ")).not.toMatch(/Match format: Round robin/);
  });
  it("pairing is its own rule: missing pairing blocks; crossover and custom drive generated fixtures", () => {
    const def = applyDiamondLeague(emptyDefinition());
    const st = def.divisions[0].sections[0].stages[0];
    st.tieFormat!.pairing = null;
    expect(tieIssues(st).some((i) => i.code === "tie_pairing")).toBe(true);
    expect(opponentPositions({ discipline: "singles", positions: [1], minutes: 20 }, "crossover")).toEqual([2]);
    expect(opponentPositions({ discipline: "doubles", positions: [1, 2], minutes: 30 }, "crossover")).toEqual([3, 4]);
    expect(opponentPositions({ discipline: "singles", positions: [1], minutes: 20 }, "custom")).toBeNull();
    const pools = snakeAllocate(Array.from({ length: 24 }, (_, i) => `p${i + 1}`), 1, 4, 6)[0];
    const pos = buildTies([pools], [def.divisions[0]], { ...st.tieFormat!, pairing: "position" });
    const x = buildTies([pools], [def.divisions[0]], { ...st.tieFormat!, pairing: "crossover" });
    expect(pos[0].rubbers[0].b).toBe(pools[pos[0].poolB][0]);
    expect(x[0].rubbers[0].b).toBe(pools[x[0].poolB][1]);
    expect(pos).toHaveLength(6);
  });
  it("mixed disciplines in one stage and out-of-range positions are rejected", () => {
    const def = applyDiamondLeague(emptyDefinition());
    const st = def.divisions[0].sections[0].stages[0];
    st.tieFormat!.rubbers.push({ discipline: "doubles", positions: [7, 8], minutes: 30 });
    const codes = tieIssues(st).map((i) => i.code);
    expect(codes).toContain("tie_discipline");
    expect(codes).toContain("tie_positions");
  });
});
