import { describe, it, expect } from "vitest";
import {
  applyLeagueUse, applyStructureTo, assertFixtureIdentity, hierarchyIssues, poolDefaultLabel, rename,
  type HDivision, type HPool, type HTournament,
} from "@/lib/tournaments/hierarchy";

const pool = (id: string, i: number, extra: Partial<HPool> = {}): HPool =>
  ({ id, kind: "pool", label: poolDefaultLabel(i), format: "round_robin", scoring: "bo5", qualifyPerPool: 2, ...extra });
const menA: HDivision = { id: "dMenA", kind: "division", label: "Men's A", stages: [
  { id: "mA_pools", kind: "stage", stageKind: "pools", label: "Pools", pools: [0, 1, 2, 3].map((i) => pool(`mA_p${i}`, i)) },
  { id: "mA_ko", kind: "stage", stageKind: "knockout", label: "Quarter Finals", pools: [] },
] };
const ladies: HDivision = { id: "dLadies", kind: "division", label: "Ladies", stages: [
  { id: "l_rr", kind: "stage", stageKind: "round_robin", label: "Round robin", pools: [pool("l_p0", 0)] },
] };
const t: HTournament = { id: "t1", kind: "tournament", label: "Club Championships", divisions: [menA, ladies] };

describe("competition hierarchy", () => {
  it("different divisions can use different formats", () => {
    expect(hierarchyIssues(t)).toEqual([]);
  });

  it("divisions stay isolated: a fixture cannot use another division's stage or pool", () => {
    const base = { tournamentId: "t1", roundId: "r1", a: "x", b: "y" };
    expect(() => assertFixtureIdentity(t, [{ ...base, divisionId: "dLadies", stageId: "mA_pools", poolId: "mA_p0", stageKind: "pools" }])).toThrow(/not in division/);
    expect(() => assertFixtureIdentity(t, [{ ...base, divisionId: "dMenA", stageId: "mA_pools", poolId: "l_p0", stageKind: "pools" }])).toThrow(/not in/);
  });

  it("pools cannot be confused with divisions", () => {
    const base = { tournamentId: "t1", roundId: "r1", a: "x", b: "y", stageId: "mA_pools", stageKind: "pools" as const, poolId: null };
    expect(() => assertFixtureIdentity(t, [{ ...base, divisionId: "mA_p0" }])).toThrow(/not a division/);
    const clash: HTournament = { ...t, divisions: [{ ...ladies, id: "mA_p0" }, menA] };
    expect(hierarchyIssues(clash).join()).toMatch(/both a division and a pool/);
  });

  it("custom labels do not change logic", () => {
    const renamed: HTournament = { ...t, divisions: [
      rename({ ...menA, stages: menA.stages.map((s) => ({ ...s, pools: s.pools.map((p) => rename(p, "Harlequins")) })) }, "1st League"),
      rename(ladies, "Pool A"), // a division labelled like a pool is still a division
    ] };
    expect(hierarchyIssues(renamed)).toEqual([]);
    expect(renamed.divisions[1].kind).toBe("division");
    expect(renamed.divisions[0].stages[0].pools[0]).toMatchObject({ id: "mA_p0", kind: "pool" });
    const fx = { tournamentId: "t1", roundId: "r1", a: "x", b: "y", divisionId: "dLadies", stageId: "l_rr", poolId: "l_p0", stageKind: "round_robin" as const };
    expect(() => assertFixtureIdentity(renamed, [fx])).not.toThrow();
  });

  it("pools within one stage share format unless advanced mixed pools is explicit", () => {
    const odd: HTournament = { ...t, divisions: [{ ...menA, stages: [{ ...menA.stages[0], pools: [pool("a", 0), pool("b", 1, { qualifyPerPool: 3 })] }] }] };
    expect(hierarchyIssues(odd).join()).toMatch(/share format/);
    const ok: HTournament = { ...t, divisions: [{ ...menA, stages: [{ ...menA.stages[0], allowMixedPoolFormats: true, pools: [pool("a", 0), pool("b", 1, { qualifyPerPool: 3 })] }] }] };
    expect(hierarchyIssues(ok)).toEqual([]);
  });

  it("playoff fixtures keep division/stage identity and never inherit a pool or pool format", () => {
    const base = { tournamentId: "t1", roundId: "qf", a: "x", b: "y", divisionId: "dMenA", stageId: "mA_ko" };
    expect(() => assertFixtureIdentity(t, [{ ...base, poolId: null, stageKind: "knockout" }])).not.toThrow();
    expect(() => assertFixtureIdentity(t, [{ ...base, poolId: "mA_p0", stageKind: "knockout" }])).toThrow(/not to pool/);
    expect(() => assertFixtureIdentity(t, [{ ...base, poolId: null, stageKind: "round_robin" }])).toThrow(/is knockout/);
    const badKo: HTournament = { ...t, divisions: [{ ...menA, stages: [menA.stages[0], { ...menA.stages[1], pools: [pool("x", 0)] }] }] };
    expect(hierarchyIssues(badKo).join()).toMatch(/knockout\/playoff stage has no pools/);
  });

  it("league membership: division allocation vs pool seeding are not conflated", () => {
    const m = [
      { id: "a", leagueId: "L1", leagueRank: 1 }, { id: "b", leagueId: "L1", leagueRank: 2 },
      { id: "c", leagueId: "L2", leagueRank: 1 },
    ];
    const div = applyLeagueUse("division_allocation", m, { L1: "div1", L2: "div2" });
    expect(div.divisions).toEqual({ div1: ["a", "b"], div2: ["c"] });
    expect(div.seeds).toBeNull();
    const seed = applyLeagueUse("pool_seeding", m);
    expect(seed.divisions).toBeNull();
    expect(seed.seeds!.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(() => applyLeagueUse(null, m)).toThrow(/Choose/);
    const teams = applyLeagueUse("team_allocation", [{ id: "a", leagueId: "L1", leagueRank: 1, teamId: "T1" }, { id: "b", leagueId: "L1", leagueRank: 2, teamId: "T1" }]);
    expect(teams.teams).toEqual({ T1: ["a", "b"] });
  });

  it("apply structure to other divisions creates fresh, isolated ids", () => {
    const juniors = applyStructureTo(menA, { id: "dJun", label: "Juniors" });
    expect(hierarchyIssues({ ...t, divisions: [menA, juniors] })).toEqual([]);
    expect(juniors.stages[0].pools.every((p) => p.id.startsWith("dJun:"))).toBe(true);
  });
});
