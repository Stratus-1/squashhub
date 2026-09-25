import { describe, it, expect } from "vitest";
import {
  admit, snakeAllocate, poolRotation, crossPoolFixtures, pairsForPool, rankFromPoints, crossoverSemis,
  homeCourt, eveningFeasibility, applyDiamondLeague, toTemplate, DIAMOND_WEDNESDAYS, interpretTranscript,
  DIAMOND_TIE, tieMinutes, tieSlots, buildTies, tieEveningCheck, tieFinish,
} from "@/lib/smart-builder/diamond-league";
import { emptyDefinition, DefinitionSchema } from "@/lib/smart-builder/definition";
import { sessionTie } from "@/lib/smart-builder/diamond-league";
import { sessionPlan } from "@/lib/smart-builder/sessions";
import { scheduleMaths, requiredRounds } from "@/lib/smart-builder/schedule-maths";
import { validate } from "@/lib/smart-builder/validate";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe("Diamond League", () => {
  it("admits first 48 confirmed, rest wait-listed", () => {
    const regs = ids(52).map((id, i) => ({ id, confirmedAt: `2026-10-01T10:${String(i).padStart(2, "0")}` }));
    regs.push({ id: "x", confirmedAt: null });
    const r = admit(regs, 48);
    expect(r.accepted).toHaveLength(48); expect(r.waitlist).toEqual(["p49", "p50", "p51", "p52"]); expect(r.unconfirmed).toEqual(["x"]);
  });
  it("snakes 48 seeds across 8 pools of 6 over both divisions", () => {
    const a = snakeAllocate(ids(48), 2, 4, 6);
    expect(a).toHaveLength(2); expect(a.flat().every((p) => p.length === 6)).toBe(true);
    expect(a[0][0].slice(0, 2)).toEqual(["p1", "p16"]);
    expect(a[1][3].slice(0, 2)).toEqual(["p8", "p9"]);
  });
  it("each pool meets every other pool once over 3 rounds", () => {
    const r = poolRotation(4);
    expect(r).toHaveLength(3);
    const seen = new Set(r.flat().map((p) => p.join("-")));
    expect(seen.size).toBe(6);
    expect(r[0]).toContainEqual([0, 1]);
  });
  it("36 singles and 18 doubles games per division; same position only", () => {
    const pools = snakeAllocate(ids(24), 1, 4, 6)[0];
    const s = crossPoolFixtures(pools);
    expect(s).toHaveLength(36);
    expect(s.every((f) => pools[f.poolA].indexOf(f.a!) === pools[f.poolB].indexOf(f.b!))).toBe(true);
    const pairs = pools.map((p) => (pairsForPool({ source: "seed", seedOrder: p }) as any).pairs);
    expect(crossPoolFixtures(pairs)).toHaveLength(18);
  });
  it("pair source must be confirmed; re-rank needs a resolvable ranking", () => {
    const order = ids(6);
    expect(pairsForPool({ source: null, seedOrder: order }).ok).toBe(false);
    expect(pairsForPool({ source: "prior_stage_standings", seedOrder: order, standingsOrder: null }).ok).toBe(false);
    expect(pairsForPool({ source: "seed", seedOrder: order })).toEqual({ ok: true, pairs: ["p1+p2", "p3+p4", "p5+p6"] });
    expect(rankFromPoints(order, null, null)).toBeNull();
    expect(rankFromPoints(["a", "b"], new Map([["a", 3], ["b", 3]]), null)).toBeNull();
    expect(rankFromPoints(["a", "b"], new Map([["a", 1], ["b", 3]]), null)).toEqual(["b", "a"]);
  });
  it("odd pool can't form whole pairs", () => {
    expect(pairsForPool({ source: "seed", seedOrder: ids(5) }).ok).toBe(false);
  });
  it("crossover semis for A/B mirrored to C/D", () => {
    const s = crossoverSemis([[0, 1], [2, 3]]);
    expect(s).toHaveLength(8);
    expect(s[0]).toMatchObject({ a: { poolIndex: 0, position: 1 }, b: { poolIndex: 1, position: 2 } });
    expect(s[1]).toMatchObject({ a: { poolIndex: 1, position: 1 }, b: { poolIndex: 0, position: 2 } });
    expect(s[6]).toMatchObject({ a: { poolIndex: 2, position: 3 }, b: { poolIndex: 3, position: 4 } });
  });
  it("template: 2 open divisions, weekly ties Wed 1-3, semis Wed 4, finals Wed 5, unresolved items", () => {
    const def = applyDiamondLeague(emptyDefinition());
    expect(DefinitionSchema.safeParse(def).success).toBe(true);
    expect(DIAMOND_WEDNESDAYS).toEqual(["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28", "2026-11-04"]);
    expect(def.divisions.map((d) => d.eligibility)).toEqual(["open", "open"]);
    expect(homeCourt(def.divisions[0], 0, 1)).toBe("Court 1");
    expect(homeCourt(def.divisions[1], 2, 3)).toBe("Court 4");
    const [ties, dbl, semis, finals] = def.divisions[0].sections[0].stages;
    expect(ties.tieFormat?.rubbers.map((r) => r.discipline)).toEqual(Array(6).fill("singles"));
    expect(dbl.discipline).toBe("doubles");
    expect(dbl.sameSessionAs).toBe(ties.id);
    expect(dbl.tieFormat?.rubbers.map((r) => r.positions)).toEqual([[1, 2], [3, 4], [5, 6]]);
    expect(ties.schedule.roundDates).toEqual(DIAMOND_WEDNESDAYS.slice(0, 3));
    expect(dbl.schedule.roundDates).toEqual(DIAMOND_WEDNESDAYS.slice(0, 3));
    expect(semis.schedule.roundDates).toEqual([DIAMOND_WEDNESDAYS[3]]);
    expect(finals.schedule.roundDates).toEqual([DIAMOND_WEDNESDAYS[4]]);
    expect(def.questions.filter((q) => q.id.startsWith("dl_") && !q.resolved).map((q) => q.id)).toEqual(["dl_points", "dl_semis", "dl_final"]);
    const t = toTemplate(def);
    expect(t.divisions[0].sections[0].stages[0].schedule.mode).toBe("unset");
    expect(t.divisions[0].sections[0].stages[0].tieFormat?.startTime).toBeNull();
  });
  it("tie = 6 singles @20 then 3 doubles @30 on one court: 210 min, 17:45 → 21:15", () => {
    expect(tieMinutes(DIAMOND_TIE)).toBe(210);
    const s = tieSlots(DIAMOND_TIE, "17:45");
    expect(s.slice(0, 6).every((r) => r.discipline === "singles" && r.minutes === 20)).toBe(true);
    expect(s.slice(6).map((r) => r.positions)).toEqual([[1, 2], [3, 4], [5, 6]]);
    expect(s[6].start).toBe("19:45");
    expect(tieFinish(DIAMOND_TIE, "17:45")).toBe("21:15");
  });
  it("round robin of ties: 4 ties per round, each pool meets every other once, courts never shared", () => {
    const def = applyDiamondLeague(emptyDefinition());
    const pools = snakeAllocate(ids(48), 2, 4, 6);
    const ties = buildTies(pools, def.divisions, { ...DIAMOND_TIE, startTime: "17:45" });
    expect(ties).toHaveLength(12);
    for (const r of [1, 2, 3]) {
      const rt = ties.filter((t) => t.round === r);
      expect(rt).toHaveLength(4);
      expect(new Set(rt.map((t) => t.court)).size).toBe(4);
      expect(new Set(rt.flatMap((t) => t.rubbers.flatMap((x) => [x.a, x.b]).filter((x) => x && !x.includes("+")))).size).toBe(48);
      expect(tieEveningCheck(rt, { ...DIAMOND_TIE, startTime: "17:45" }, "21:30").state).toBe("feasible");
      expect(tieEveningCheck(rt, { ...DIAMOND_TIE, startTime: "17:45" }, "21:00").state).toBe("infeasible");
    }
    const d1 = new Set(ties.filter((t) => t.division === 0).map((t) => `${t.poolA}-${t.poolB}`));
    expect(d1.size).toBe(6);
    expect(ties[0].rubbers[6]).toMatchObject({ a: `${pools[0][0][0]}+${pools[0][0][1]}` });
  });
  it("schedule is green only when feasible", () => {
    expect(eveningFeasibility(Array(6).fill("Court 1"), null, 20).state).toBe("incomplete");
    expect(eveningFeasibility(Array(6).fill("Court 1"), 180, 20).state).toBe("feasible");
    expect(eveningFeasibility(Array(12).fill("Court 1"), 180, 20).state).toBe("infeasible");
  });
  it("interpretation never falls back to a standard format", () => {
    const r = interpretTranscript("Diamond League, 48 players, cross-pool, pairs #1+#2, points to be decided, then a final");
    expect(r.fallbackUsed).toBe(false);
    expect(r.rules.find((x) => x.rule === "Points formula")?.confirmed).toBe(false);
  });

  it("sessions: Wed 1-3 = one 17:45-21:15 session holding Singles then Doubles; no date-overlap errors", () => {
    const def = applyDiamondLeague(emptyDefinition());
    const { sessions, issues } = sessionPlan(def);
    expect(issues).toEqual([]);
    const wk = sessions.filter((x) => x.parts.length === 2);
    expect(wk.map((x) => x.date)).toEqual(DIAMOND_WEDNESDAYS.slice(0, 3));
    expect(wk[0].label).toBe("Wednesday 7 Oct, 17:45–21:15 — Singles + Doubles");
    expect(wk[0].divisionIds).toHaveLength(2);
    expect(wk[0].parts.map((p) => [p.name, p.start, p.end, p.minutesPerCourt])).toEqual([["Singles", "17:45", "19:45", 120], ["Doubles", "19:45", "21:15", 90]]);
    const m = scheduleMaths(def);
    expect(m.issues.filter((i) => ["dependency", "session", "round_order"].includes(i.code))).toEqual([]);
    expect(validate(def).issues.filter((i) => i.code === "date_order")).toEqual([]);
    expect(sessionTie(def).rubbers).toHaveLength(9);
    expect(requiredRounds(def.divisions[0].sections[0].stages[0], def)).toBe(3);
  });
  it("sessions: a same-session stage on different dates, or an overrunning evening, is flagged", () => {
    const def = applyDiamondLeague(emptyDefinition());
    def.divisions[0].sections[0].stages[1].schedule.roundDates = ["2026-10-28"];
    expect(sessionPlan(def).issues.some((i) => i.code === "session_dates")).toBe(true);
    const d2 = applyDiamondLeague(emptyDefinition());
    d2.scheduleDefaults.sessionMinutes = 180;
    expect(sessionPlan(d2).issues.some((i) => i.code === "session_overrun")).toBe(true);
  });
  it("without a same-session link, a later stage on the same date is still a dependency error", () => {
    const def = applyDiamondLeague(emptyDefinition());
    def.divisions[0].sections[0].stages[1].sameSessionAs = null;
    expect(scheduleMaths(def).issues.some((i) => i.code === "dependency")).toBe(true);
  });
});
