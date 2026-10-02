import { describe, it, expect } from "vitest";
import { defaultPools, poolWarnings, poolsFor, unitId, buildDrawSpec, finalDrawSpec, orderUnits, previewDraw, proposeFormat, rankingIssue, roundDeadlines, unitsFor, withEntrants, type DivFormat, type DrawDivision, type RegLite } from "@/lib/smart-builder/step-draw";
import { generateFromSpec } from "@/lib/tournaments/engine-service";
import { distributeIntoPools, moveToPool } from "@/lib/tournaments/pools";

// 4 doubles categories × 5 pairs = 20 pairs / 40 players, all payment outstanding, plus one cancelled stale entry.
const regs: RegLite[] = [];
for (let g = 1; g <= 4; g++) for (let p = 1; p <= 5; p++) {
  const a = `g${g}p${p}a`, b = `g${g}p${p}b`;
  regs.push({ club_member_id: a, partner_member_id: b, status: "pending_payment", division_choices: [g] });
  regs.push({ club_member_id: b, partner_member_id: a, status: "pending_payment", division_choices: [g] });
}
regs.push({ club_member_id: "stale", partner_member_id: "g1p1a", status: "cancelled", division_choices: [1] });

const fmt: DivFormat = { kind: "round_robin", pools: 1, swissRounds: 0, seeding: "entry_order", schedule: { rule: "play_by", deadlines: ["2026-11-30"], upto: [], dates: [] }, crossGroups: [] };
const divs = (): DrawDivision[] => [1, 2, 3, 4].map((g) => ({ group: g, label: `Cat ${g} · Doubles`, doubles: true, units: unitsFor(regs, g, 4, true).units, format: fmt, notes: [], playoffs: [] }));

describe("Step-by-Step generate draw", () => {
  it("uses current active entries only: 20 pairs / 40 players, payment-independent", () => {
    const d = divs();
    expect(d.reduce((s, x) => s + x.units.length, 0)).toBe(20);
    expect(new Set(d.flatMap((x) => x.units.flatMap((u) => [u.member, u.partner]))).size).toBe(40);
    expect(d.flatMap((x) => x.units).some((u) => u.member === "stale" || u.partner === "stale")).toBe(false);
  });
  it("never splits a pair and flags broken pairs", () => {
    const fx = generateFromSpec(withEntrants(buildDrawSpec("T", divs(), "v1"), divs()), "t");
    for (const f of fx) for (const u of [f.a, f.b]) expect(u!.split("+")).toHaveLength(2);
    const broken = unitsFor([{ club_member_id: "x", partner_member_id: "y", status: "pending_payment", division_choices: [1] }, { club_member_id: "y", partner_member_id: "z", status: "pending_payment", division_choices: [1] }], 1, 1, true);
    expect(broken.units).toHaveLength(0);
    expect(broken.errors.length).toBeGreaterThan(0);
  });
  it("previews the same games the engine generates (5 pairs RR = 10 games per category)", () => {
    const p = previewDraw("T", divs(), { start: "2026-10-08", end: null });
    expect(p.errors).toEqual([]);
    expect(p.total).toBe(40);
    expect(p.divisions.every((x) => x.games === 10)).toBe(true);
  });
  it("blocks undecided format and too-small pools", () => {
    const d = divs(); d[0] = { ...d[0], format: { ...fmt, kind: null } }; d[1] = { ...d[1], format: { ...fmt, kind: "pools", pools: 3 } };
    const p = previewDraw("T", d, { start: null, end: null });
    expect(p.errors.some((e) => e.startsWith("Cat 1"))).toBe(true);
    expect(p.errors.some((e) => e.startsWith("Cat 2"))).toBe(true);
  });
  it("regeneration uses fresh stage ids so a rebuilt structure never reuses stale stage rows", () => {
    expect(buildDrawSpec("T", divs(), "v1").divisions[0].stages[0].id).not.toBe(buildDrawSpec("T", divs(), "v2").divisions[0].stages[0].id);
  });
  it("reads cross-league, rankings and both play-by rounds from the plan — no silent fallback", () => {
    const plan = { format: { kind: "cross", crossUnits: ["Mens::A", "Mens::B"] }, seeding: "ranking", stages: [{ phase: "main", mode: "play_by", deadline: "2026-10-19" }, { phase: "main", mode: "play_by", deadline: "2026-10-12" }] };
    const p = proposeFormat(plan, "Mens › A · Doubles");
    expect(p.format.kind).toBe("cross");
    expect(p.crossKeys).toEqual(["Mens::A", "Mens::B"]);
    expect(p.format.seeding).toBe("ranking");
    expect(p.format.schedule.deadlines).toEqual(["2026-10-12", "2026-10-19"]);
    expect(proposeFormat({ format: { kind: "later" } }, "Mens › A · Doubles").format.kind).toBeNull();
  });
  it("cross-league: 4 groups × 5 pairs, each group plays every other group, never its own; pairs intact", () => {
    const d = divs().map((x) => ({ ...x, format: { ...fmt, kind: "cross" as const, crossGroups: [1, 2, 3, 4] } }));
    const p = previewDraw("T", d, { start: "2026-10-08", end: null });
    expect(p.errors).toEqual([]);
    expect(p.total).toBe(150); // 6 group meetings × 25
    const fx = generateFromSpec(withEntrants(finalDrawSpec("T", d, "v1"), d), "t");
    const grp = (u: string) => u.split("+")[0].slice(0, 2);
    for (const f of fx) { expect(f.a!.split("+")).toHaveLength(2); expect(grp(f.a!)).not.toBe(grp(f.b!)); }
    const perRound = new Map<number, string[]>();
    for (const f of fx) perRound.set(f.round!, [...(perRound.get(f.round!) ?? []), f.a!, f.b!]);
    for (const ids of perRound.values()) expect(new Set(ids).size).toBe(ids.length);
    const spec = finalDrawSpec("T", d, "v1");
    expect(spec.divisions).toHaveLength(1);
    expect(spec.divisions[0].entryGroups).toEqual([1, 2, 3, 4]);
  });
  it("cross-league sets must agree; a 2-group set gives 25 games and others stay normal", () => {
    const d = divs();
    d[0] = { ...d[0], format: { ...fmt, kind: "cross", crossGroups: [1, 2] } };
    d[1] = { ...d[1], format: { ...fmt, kind: "cross", crossGroups: [1, 2] } };
    const p = previewDraw("T", d, { start: null, end: null });
    expect(p.errors).toEqual([]);
    expect(p.total).toBe(25 + 10 + 10);
    const spec = buildDrawSpec("T", d, "v1");
    expect(spec.divisions.map((x) => x.groupNumber)).toEqual([1, 3, 4]);
    const bad = divs(); bad[0] = { ...bad[0], format: { ...fmt, kind: "cross", crossGroups: [1, 2] } };
    expect(previewDraw("T", bad, { start: null, end: null }).errors.some((e) => e.includes("different format"))).toBe(true);
  });
  it("rankings: seeds by club ranking points; blocks instead of falling back when unresolvable", () => {
    const u = divs()[0].units;
    const pts = new Map<string, number | null>([[u[3].member, 50], [u[1].partner!, 30]]);
    expect(orderUnits(u, "ranking", { seed: 1, points: pts }).slice(0, 2)).toEqual([u[3], u[1]]);
    expect(rankingIssue(u, "club", pts)).toBeNull();
    expect(rankingIssue(u, "club", new Map())).toMatch(/ranking points/);
    expect(rankingIssue(u, "national", pts)).toMatch(/national/);
    expect(rankingIssue(u, null, pts)).toMatch(/event level/);
    const d = divs(); d[0] = { ...d[0], format: { ...fmt, seeding: "ranking" }, blockers: [rankingIssue(u, "club", new Map())!] };
    expect(previewDraw("T", d, { start: null, end: null }).total).toBe(0);
  });
  it("two play-by rounds stay separate: rounds split across both dates, never collapsed to the last", () => {
    const two = { ...fmt.schedule, deadlines: ["2026-10-12", "2026-10-19"], upto: [null] };
    expect(roundDeadlines(two, 5).dates).toEqual(["2026-10-12", "2026-10-12", "2026-10-12", "2026-10-19", "2026-10-19"]);
    expect(roundDeadlines({ ...two, upto: [2] }, 5).dates).toEqual(["2026-10-12", "2026-10-12", "2026-10-19", "2026-10-19", "2026-10-19"]);
    expect(roundDeadlines({ ...two, deadlines: ["a", "b", "c"], upto: [null, null] }, 2).error).toMatch(/only 2 rounds/);
    const d = divs().map((x) => ({ ...x, format: { ...fmt, schedule: two } }));
    const spec = finalDrawSpec("T", d, "v1");
    expect((spec.divisions[0].stages[0].schedule as any).roundDates).toEqual(["2026-10-12", "2026-10-12", "2026-10-12", "2026-10-19", "2026-10-19"]);
    const p = previewDraw("T", d, { start: "2026-10-08", end: null });
    expect(p.divisions[0].perRound.map((r) => r.date)).toEqual(["2026-10-12", "2026-10-12", "2026-10-12", "2026-10-19", "2026-10-19"]);
  });
  it("pool preview reuses the builder allocation and the organiser's move is exactly what is generated", () => {
    const base = divs()[0];
    const d: DrawDivision = { ...base, units: [...base.units, ...divs()[1].units], format: { ...fmt, kind: "pools", pools: 2 } };
    expect(poolsFor(d)).toEqual(distributeIntoPools(d.units.map(unitId), 2, { mode: "snake" }));
    expect(defaultPools(d.units, 2, "banded")[0]).toEqual(d.units.slice(0, 5).map(unitId));
    const cur = poolsFor(d)!;
    const mover = cur[0][1];
    const r = moveToPool(cur.flat(), mover, 1, 2, { manual: true, sizes: cur.map((p) => p.length) })!;
    const manualPools = distributeIntoPools(r.ids, 2, { manual: true, sizes: r.sizes });
    const moved: DrawDivision = { ...d, manualPools };
    expect(manualPools[1]).toContain(mover);
    expect(poolWarnings(moved)[0]).toMatch(/uneven \(4 \/ 6\)/);
    const spec = finalDrawSpec("T", [moved], "v1");
    expect((spec.divisions[0].stages[0] as any).poolMembers).toEqual(manualPools);
    const fx = generateFromSpec(withEntrants(spec, [moved]), "t");
    expect(fx.filter((f) => f.poolId?.endsWith("pool2") && (f.a === mover || f.b === mover)).length).toBe(5);
    expect(mover.split("+")).toHaveLength(2);
    const lonely: DrawDivision = { ...d, manualPools: [[cur.flat()[0]], cur.flat().slice(1)] };
    expect(previewDraw("T", [lonely], { start: null, end: null }).errors.some((e) => e.includes("at least 2"))).toBe(true);
    const badSpec = withEntrants(spec, [moved]);
    (badSpec.divisions[0].stages[0] as any).poolMembers = [manualPools[0], manualPools[1].slice(1)];
    expect(() => generateFromSpec(badSpec, "t")).toThrow(/don't match/);
  });
});
