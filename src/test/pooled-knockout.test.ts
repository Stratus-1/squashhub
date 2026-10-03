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
