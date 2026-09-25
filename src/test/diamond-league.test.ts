import { describe, it, expect } from "vitest";
import {
  admit, snakeAllocate, poolRotation, crossPoolFixtures, pairsForPool, rankFromPoints, crossoverSemis,
  homeCourt, eveningFeasibility, applyDiamondLeague, toTemplate, DIAMOND_WEDNESDAYS, interpretTranscript,
} from "@/lib/smart-builder/diamond-league";
import { emptyDefinition, DefinitionSchema } from "@/lib/smart-builder/definition";

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
  it("template: 2 open divisions, home courts, 5 Wednesdays, unresolved items", () => {
    const def = applyDiamondLeague(emptyDefinition());
    expect(DefinitionSchema.safeParse(def).success).toBe(true);
    expect(DIAMOND_WEDNESDAYS).toEqual(["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28", "2026-11-04"]);
    expect(def.divisions.map((d) => d.eligibility)).toEqual(["open", "open"]);
    expect(homeCourt(def.divisions[0], 0, 1)).toBe("Court 1");
    expect(homeCourt(def.divisions[1], 2, 3)).toBe("Court 4");
    expect(def.divisions[0].sections[0].stages[0].schedule.roundDates).toEqual(DIAMOND_WEDNESDAYS.slice(0, 3));
    expect(def.divisions[0].sections[0].stages[1].schedule.mode).toBe("unset");
    expect(def.pairSource).toBeNull();
    expect(def.questions.filter((q) => q.id.startsWith("dl_") && !q.resolved).map((q) => q.id)).toEqual(["dl_points", "dl_pair_source", "dl_final", "dl_overall", "dl_w45"]);
    const t = toTemplate(def);
    expect(t.divisions[0].sections[0].stages[0].schedule.mode).toBe("unset");
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
});
