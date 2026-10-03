import { describe, expect, it } from "vitest";
import { buildDrawSpec, divisionIssues, formatWithPoolRule, previewDraw, isPooledKnockout, type DrawDivision, type DivFormat } from "@/lib/smart-builder/step-draw";
import { reviewPools } from "@/lib/smart-builder/pool-plan";
import { generateFromSpec } from "@/lib/tournaments/engine-service";
import { poolKnockoutTarget, pooledRoundCounts } from "@/lib/tournaments/paced-knockout";

const units = (n: number) => Array.from({ length: n }, (_, i) => ({ member: `p${i + 1}`, partner: null }));
const koFormat = (pace: "paced" | "immediate", target: number | null, rounds: number | null): DivFormat => ({
  kind: "knockout", pools: 1, swissRounds: 0, seeding: "entry_order", crossGroups: [], crossVs: null,
  schedule: { rule: "play_by", deadlines: ["2026-11-01", "2026-11-08", "2026-11-15"], upto: [null, null], dates: [] },
  paced: pace === "paced" ? { pairing: "progressive", target, rounds, label: "Quarter-final" } : null,
  ko: { pace, pairing: "progressive", target, rounds, label: "Quarter-final" },
});

describe("knockout inside pools (NSP Knock out acceptance)", () => {
  const rule = { mode: "auto", target: "5" } as const;
  const div = (n: number, pace: "paced" | "immediate" = "paced"): DrawDivision => {
    const format = formatWithPoolRule(koFormat(pace, 8, 3), rule as any, n);
    return { group: 1, label: "Men › 1st · Singles", doubles: false, units: units(n), format, notes: [], playoffs: [], poolReview: reviewPools(rule as any, "Men 1st", n, "player"), poolAccepted: true };
  };
  it("Create pools = Yes keeps the format as knockout and splits the field", () => {
    const d = div(18);
    expect(d.format.kind).toBe("knockout");
    expect(d.format.pools).toBe(4);
    expect(isPooledKnockout(d.format)).toBe(true);
    expect(divisionIssues(d)).toEqual([]);
  });
  it("generates elimination fixtures within pools only — no round robin", () => {
    const d = div(18);
    const p = previewDraw("NSP", [d], { start: null, end: null });
    expect(p.errors).toEqual([]);
    const spec = buildDrawSpec("NSP", [d], "v1");
    const st: any = spec.divisions[0].stages[0];
    expect(st.kind).toBe("knockout");
    const fx = generateFromSpec({ ...spec, divisions: spec.divisions.map((x) => ({ ...x, entrants: d.units.map((u, k) => ({ id: u.member, rank: k + 1 })) })) }, "t");
    const poolOf = new Map<string, number>(st.poolMembers.flatMap((p: string[], i: number) => p.map((id) => [id, i + 1] as [string, number])));
    for (const f of fx) { expect(poolOf.get(f.a!)).toBe(f.koPool); expect(poolOf.get(f.b!)).toBe(f.koPool); }
    // 18 players, round robin in 4 pools would be 10+10+6+6 = 32 games; knockout is far fewer and paced.
    expect(fx.length).toBeLessThan(10);
    expect(fx.length).toBe(st.paced.perPool.reduce((s: number, x: number) => s + x, 0));
  });
  it("targets: explicit per-pool qualifiers win, else milestone split, else pool winner", () => {
    expect(poolKnockoutTarget(8, 4, null)).toBe(2);
    expect(poolKnockoutTarget(8, 4, 1)).toBe(1);
    expect(poolKnockoutTarget(null, 3, null)).toBe(1);
    expect(pooledRoundCounts([5, 5, 4, 4], { target: 2, roundsLeft: 3, pace: "paced" })).toEqual([1, 1, 1, 1]);
    expect(pooledRoundCounts([5, 4], { target: 2, roundsLeft: 3, pace: "immediate" })).toEqual([2, 2]);
  });
  it("round robin pools are unchanged", () => {
    const f: DivFormat = { ...koFormat("immediate", null, null), kind: "pools", pools: 2, paced: null, ko: null };
    expect(formatWithPoolRule(f, rule as any, 18)).toMatchObject({ kind: "pools", pools: 4 });
  });
});

describe("knockout round maths (acceptance: 10 players, 2 pools of 5, QF field 8, 4 dates)", () => {
  it("needs 2 eliminations and 1 round, never 5 round-robin rounds", async () => {
    const { knockoutRoundsNeeded, knockoutNeedText, previewDraw, formatWithPoolRule } = await import("@/lib/smart-builder/step-draw");
    const { reviewPools } = await import("@/lib/smart-builder/pool-plan");
    const base: any = { kind: "knockout", pools: 1, swissRounds: 0, seeding: "entry_order", crossGroups: [], crossVs: null,
      schedule: { rule: "play_by", deadlines: ["2026-10-10", "2026-10-13", "2026-10-16", "2026-10-19"], upto: [null, null, null], dates: [] },
      paced: null, ko: { pace: "immediate", pairing: "traditional", target: 8, rounds: 4, label: "Quarterfinals" } };
    const rule: any = { mode: "auto", target: "5" };
    const d: any = { group: 1, label: "Mens 1st · Singles", doubles: false, units: Array.from({ length: 10 }, (_, i) => ({ member: `m${i}`, partner: null })),
      format: formatWithPoolRule(base, rule, 10), notes: [], playoffs: [], poolReview: reviewPools(rule, "Mens 1st", 10, "player"), poolAccepted: true };
    expect(d.format.pools).toBe(2);
    expect(knockoutRoundsNeeded(d)).toBe(1);
    expect(knockoutNeedText(d)).toMatch(/^2 eliminations needed/);
    const p = previewDraw("NSP", [d], { start: null, end: null });
    expect(p.errors).toEqual([]);
    expect(p.roundsByGroup[1]).toBe(1);
    expect(p.divisions[0].perRound[0].date).toBe("2026-10-10");
  });
});

describe("organiser-reviewed Round 1 matches (nothing created until Generate, exactly what was reviewed)", () => {
  const rule = { mode: "auto", target: "5" } as const;
  const mk = (n: number): DrawDivision => {
    const format = formatWithPoolRule(koFormat("paced", 8, 3), rule as any, n);
    return { group: 1, label: "Men › 1st · Singles", doubles: false, units: units(n), format, notes: [], playoffs: [], poolReview: reviewPools(rule as any, "Men 1st", n, "player"), poolAccepted: true };
  };
  const gen = (d: DrawDivision) => {
    const spec = buildDrawSpec("NSP", [d], "v1");
    return generateFromSpec({ ...spec, divisions: spec.divisions.map((x) => ({ ...x, entrants: d.units.map((u, k) => ({ id: u.member, rank: k + 1 })) })) }, "t");
  };
  it("proposes per pool and generates exactly the edited matches", async () => {
    const { proposedKnockoutRound1 } = await import("@/lib/smart-builder/step-draw");
    const d = mk(10);
    const prop = proposedKnockoutRound1("NSP", [d]).get(1)!;
    expect(prop).toHaveLength(2);
    const pool0 = (buildDrawSpec("NSP", [d], "v1").divisions[0].stages[0] as any).poolMembers[0] as string[];
    const edited: Array<Array<[string, string]>> = [[[pool0[0], pool0[1]], [pool0[2], pool0[3]]], []];
    const fx = gen({ ...d, koPairs: edited });
    expect(fx.map((f) => [f.a, f.b])).toEqual(edited[0]);
    expect(fx.every((f) => f.round === 1)).toBe(true);
  });
  it("refuses a confirmed match that crosses pools or repeats a player", () => {
    const d = mk(10);
    const pm = (buildDrawSpec("NSP", [d], "v1").divisions[0].stages[0] as any).poolMembers as string[][];
    expect(() => gen({ ...d, koPairs: [[[pm[0][0], pm[1][0]]], []] })).toThrow(/Round 1 matches/);
    expect(() => gen({ ...d, koPairs: [[[pm[0][0], pm[0][1]], [pm[0][0], pm[0][2]]], []] })).toThrow(/Round 1 matches/);
  });
});
