import { describe, it, expect } from "vitest";
import { emptyDefinition, parseDefinition, type TournamentDefinition } from "@/lib/smart-builder/definition";
import { addStage, setFormat, setDiscipline, setSameSession, stageDetailLines } from "@/lib/smart-builder/stage-builder";
import { stageCourts, stageMatch } from "@/lib/smart-builder/court-allocation";
import { diamondShape, applyDiamondLeague, buildTies, snakeAllocate } from "@/lib/smart-builder/diamond-league";
import { opponentPositions, tieIssues, standardRubbers } from "@/lib/smart-builder/ties";
import { sessionPlan } from "@/lib/smart-builder/sessions";
import { scheduleMaths } from "@/lib/smart-builder/schedule-maths";
import { stageScoringLine, scoringText, effectiveScoring, scoringIssues } from "@/lib/smart-builder/scoring";
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
    expect(lines[0]).toBe("Pool-v-pool with explicit matchups · Singles");
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

  it("scoring is per stage: Diamond Singles Bells 20, Doubles Bells 30; missing cap blocks; round override", () => {
    const def = applyDiamondLeague(emptyDefinition());
    const [s1, s2, semis] = def.divisions[0].sections[0].stages;
    expect(stageScoringLine(def, s1)).toBe("Singles — Bells — bell at 20 min");
    expect(stageScoringLine(def, s2)).toBe("Doubles — Bells — bell at 30 min");
    expect(stageDetailLines(s2, def)).toContain("Match format: Doubles — Bells — bell at 30 min");
    expect(sessionPlan(def).sessions[0].minutes).toBe(210);
    expect(validateDefinition(def).issues.filter((i) => i.code === "scoring_cap")).toEqual([]);
    s2.scoring = { mode: "time_capped_points", timeCapMinutes: null };
    expect(validateDefinition(def).issues.some((i) => i.code === "scoring_cap" && i.level === "error")).toBe(true);
    s2.scoring = { mode: "time_capped_points", timeCapMinutes: 40 };
    // Scoring (bell time) never drives the schedule; court-slot minutes on the games do.
    expect(sessionPlan(def).sessions[0].minutes).toBe(210);
    s2.tieFormat!.rubbers.forEach((r) => { r.minutes = 40; });
    expect(sessionPlan(def).sessions[0].minutes).toBe(120 + 120);
    semis.roundScoring = { "0": { mode: "standard", pointsPerGame: 11, bestOf: 5 } };
    expect(scoringText(effectiveScoring(def, semis, 0))).toBe("PAR 11 — best of 5");
    semis.roundScoring = { "0": { mode: "time_capped_points" } };
    expect(scoringIssues(def).some((i) => i.stageId === semis.id && i.round === 0)).toBe(true);
  });
  it("stage scoring overrides tournament scoring family", () => {
    const def = applyDiamondLeague(emptyDefinition());
    def.scoring = { pointsPerGame: 15, bestOf: 3, mode: "standard" };
    const s1 = def.divisions[0].sections[0].stages[0];
    expect(effectiveScoring(def, s1)).toEqual({ mode: "time_capped_points", timeCapMinutes: 20 });
    s1.scoring = undefined;
    expect(scoringText(effectiveScoring(def, s1))).toBe("PAR 15 — best of 3");
  });

  it("standings method is per stage: Diamond stays Needs confirmation and blocks; choices validate", () => {
    const def = applyDiamondLeague(emptyDefinition());
    const [s1] = def.divisions[0].sections[0].stages;
    const lines = stageDetailLines(s1, def);
    expect(lines).toContain("Standings: Needs confirmation");
    expect(lines).toContain("Score at the bell: Needs confirmation");
    expect(lines).toContain("Tie-breaks: Needs confirmation");
    const errs = () => validateDefinition(def).issues.filter((i) => i.code === "standings" && i.level === "error" && i.stageId === s1.id);
    expect(errs().length).toBe(3);
    s1.standings = { method: "result_points", resultPoints: { win: 2, draw: null, loss: 0 }, bellsScore: "decides_winner", tieBreaks: ["head_to_head"] };
    expect(errs().map((e) => e.message).join()).toMatch(/win, draw and loss/);
    s1.standings.resultPoints!.draw = 1;
    expect(errs()).toEqual([]);
    expect(stageDetailLines(s1, def)).toContain("Standings: result points (win 2 / draw 1 / loss 0)");
    s1.standings = { method: "combined", combined: { primary: "raw_total", secondary: ["rubbers_won"] }, bellsScore: "counts_directly", tieBreaks: ["points_difference", "head_to_head"] };
    expect(errs()).toEqual([]);
    expect(stageDetailLines(s1, def)).toContain("Tie-breaks: Points difference → Head-to-head");
  });
  it("older round robins without a standings choice only get a warning (backward compatible)", () => {
    const def = emptyDefinition();
    def.divisions = [{ id: "d", name: "D", eligibility: "open", entry: "individual", sections: [{ id: "s", name: "Main", stages: [{ id: "rr", name: "RR", kind: "round_robin", discipline: "singles", groups: 1, groupSize: 4, input: { entrants: 4 }, advance: { role: "none" }, schedule: { mode: "unset" } } as any] }] } as any];
    const st = validateDefinition(def).issues.filter((i) => i.code === "standings");
    expect(st.every((i) => i.level === "warning")).toBe(true);
  });

  it("Diamond scales with entry: 48 → 2×4, 36 → 2×3, 24 → 1×4; dates and courts follow", () => {
    expect(diamondShape(48).divisions).toEqual([4, 4]);
    expect(diamondShape(36).divisions).toEqual([3, 3]);
    expect(diamondShape(36, 6, 6).divisions).toEqual([6]);
    expect(diamondShape(24).divisions).toEqual([4]);
    expect(diamondShape(40).unplaced).toBe(4);
    const def = applyDiamondLeague(emptyDefinition(), { capacity: 36 });
    expect(def.divisions.map((d) => d.poolNames?.length)).toEqual([3, 3]);
    const s1 = def.divisions[0].sections[0].stages[0];
    expect(s1.groups).toBe(3);
    expect(s1.schedule.roundDates).toHaveLength(3); // 3 pools → 3 weeks, one pool rests
    expect(def.divisions[0].sections[0].stages[2].schedule.roundDates).toEqual(["2026-10-28"]);
    expect(validateDefinition(def).issues.filter((i) => i.level === "error" && i.code.startsWith("tie_"))).toEqual([]);
    const d24 = applyDiamondLeague(emptyDefinition(), { capacity: 24 });
    expect(d24.divisions).toHaveLength(1);
    expect(sessionPlan(d24).sessions[0].minutes).toBe(210);
  });
  it("courts resolve from pools, then division, then the tournament — never 'missing' when the tournament has courts", () => {
    const def = applyDiamondLeague(emptyDefinition());
    const d = def.divisions[0], st = d.sections[0].stages[0];
    expect(stageCourts(def, d, st)).toMatchObject({ source: "pools", count: 2 });
    d.poolGroups = [];
    def.event = { ...(def.event ?? {}), venues: { clubIds: ["c1"], courtIds: { c1: [1, 2, 3, 4] } } } as any;
    expect(stageCourts(def, d, st)).toMatchObject({ source: "tournament", count: 4 });
    d.courtKeys = ["c1:1", "c1:2"];
    expect(stageCourts(def, d, st)).toMatchObject({ source: "division", count: 2 });
    expect(stageMatch(def, st).text).toBe("6 games × 20m = 120m per tie");
  });

  it("club chooses divisions × pools; singles+doubles session and semis/finals stay", () => {
    const def = applyDiamondLeague(emptyDefinition(), { divisions: 1, poolsPerDivision: 6 });
    expect(def.divisions.map((d) => d.poolNames?.length)).toEqual([6]);
    expect(def.admission?.capacity).toBe(36);
    const [s1, s2, semis, finals] = def.divisions[0].sections[0].stages;
    expect([s1.discipline, s2.discipline, s2.sameSessionAs]).toEqual(["singles", "doubles", s1.id]);
    expect(s1.schedule.roundDates).toHaveLength(5);
    expect(semis.name).toBe("Semi-finals"); expect(finals.name).toBe("Finals");
    expect(sessionPlan(def).sessions[0].label).toMatch(/Singles \+ Doubles/);
  });

  it("older drafts with singles+doubles in one stage are split into Singles + same-session Doubles on open", () => {
    const def = applyDiamondLeague(emptyDefinition());
    const sec = def.divisions[0].sections[0];
    const [s1, s2, semis, finals] = sec.stages;
    s1.name = "Pool-v-pool ties";
    s1.tieFormat!.rubbers = [...s1.tieFormat!.rubbers, ...s2.tieFormat!.rubbers];
    sec.stages = [s1, semis, finals]; semis.input = { fromStageId: s1.id };
    const p = parseDefinition(JSON.parse(JSON.stringify(def)));
    expect(p.ok).toBe(true);
    const st = (p as any).value.divisions[0].sections[0].stages;
    expect(st.map((x: any) => x.name)).toEqual(["Singles", "Doubles", "Semi-finals", "Finals"]);
    expect(st[1].sameSessionAs).toBe(st[0].id);
    expect(st[1].tieFormat.rubbers.map((r: any) => r.positions)).toEqual([[1, 2], [3, 4], [5, 6]]);
    expect(st[2].input.fromStageId).toBe(st[1].id);
    expect(sessionPlan((p as any).value).sessions[0].label).toMatch(/Singles \+ Doubles/);
  });
});

