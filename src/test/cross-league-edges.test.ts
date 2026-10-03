import { describe, it, expect } from "vitest";
import { crossEdges, crossOpponents, divisionIssues, finalDrawSpec, previewDraw, withEntrants, type DivFormat, type DrawDivision } from "@/lib/smart-builder/step-draw";
import { generateFromSpec } from "@/lib/tournaments/engine-service";

const fmt: DivFormat = { kind: "cross", pools: 1, swissRounds: 0, seeding: "ladder", schedule: { rule: "play_by", deadlines: ["2026-11-30"], upto: [], dates: [] }, crossGroups: [] };
const grp = (g: number, n: number, f: Partial<DivFormat>): DrawDivision => ({
  group: g, label: `${g}th League · Singles`, doubles: false, notes: [], playoffs: [],
  units: Array.from({ length: n }, (_, i) => ({ member: `g${g}p${i + 1}`, partner: null })) as any,
  format: { ...fmt, ...f },
});
const games = (d: DrawDivision[]) => {
  const fx = generateFromSpec(withEntrants(finalDrawSpec("T", d, "v1"), d), "t");
  return fx.filter((f) => f.a && f.b);
};
const key = (a: string, b: string) => [a, b].sort().join("|");

describe("cross-league relationships are canonical group-pair edges", () => {
  it("6th (6) vs 7th (6), both selected = exactly 36 unique cross matches, none within a league", () => {
    const d = [grp(6, 6, { crossGroups: [6, 7] }), grp(7, 6, { crossGroups: [6, 7] })];
    expect(d.flatMap((x) => divisionIssues(x, d))).toEqual([]);
    const p = previewDraw("T", d, { start: null, end: null });
    expect(p.errors).toEqual([]); expect(p.total).toBe(36);
    const fx = games(d);
    expect(fx).toHaveLength(36);
    expect(new Set(fx.map((f) => key(f.a!, f.b!))).size).toBe(36);
    for (const f of fx) expect(f.a!.slice(0, 2)).not.toBe(f.b!.slice(0, 2));
  });
  it("selection that omits the group itself (screenshot case) still counts", () => {
    const d = [grp(6, 6, { crossGroups: [7] }), grp(7, 6, { crossGroups: [6] })];
    expect(d.flatMap((x) => divisionIssues(x, d))).toEqual([]);
    expect(previewDraw("T", d, { start: null, end: null }).total).toBe(36);
  });
  it("A selects B only -> valid reciprocal relationship", () => {
    const d = [grp(6, 6, { crossVs: [7], crossGroups: [6, 7] }), grp(7, 6, { crossVs: [] })];
    expect(crossOpponents(d[1], d)).toEqual([6]);
    expect(d.flatMap((x) => divisionIssues(x, d))).toEqual([]);
    expect(games(d)).toHaveLength(36);
  });
  it("A and B both select each other -> still 36, not 72", () => {
    const d = [grp(6, 6, { crossVs: [7] }), grp(7, 6, { crossVs: [6] })];
    expect(crossEdges(d)).toEqual([[6, 7]]);
    expect(games(d)).toHaveLength(36);
  });
  it("3 groups all-selected -> AB + AC + BC once each", () => {
    const d = [1, 2, 3].map((g) => grp(g, 4, { crossGroups: [1, 2, 3] }));
    expect(crossEdges(d)).toEqual([[1, 2], [1, 3], [2, 3]]);
    expect(previewDraw("T", d, { start: null, end: null }).total).toBe(48);
  });
  it("custom subset edges honour only chosen pairs", () => {
    const d = [grp(1, 4, { crossVs: [2] }), grp(2, 4, { crossVs: [] }), grp(3, 4, { crossVs: [2] })];
    expect(crossEdges(d)).toEqual([[1, 2], [2, 3]]);
    expect(previewDraw("T", d, { start: null, end: null }).total).toBe(32);
  });
  it("a single isolated group is still invalid", () => {
    const d = [grp(6, 6, { crossGroups: [] })];
    expect(divisionIssues(d[0], d).join()).toMatch(/at least one other group/);
  });
});
