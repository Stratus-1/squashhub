import { describe, it, expect } from "vitest";
import { buildDrawSpec, previewDraw, proposeFormat, unitsFor, withEntrants, type DrawDivision, type RegLite } from "@/lib/smart-builder/step-draw";
import { generateFromSpec } from "@/lib/tournaments/engine-service";

// 4 doubles categories × 5 pairs = 20 pairs / 40 players, all payment outstanding, plus one cancelled stale entry.
const regs: RegLite[] = [];
for (let g = 1; g <= 4; g++) for (let p = 1; p <= 5; p++) {
  const a = `g${g}p${p}a`, b = `g${g}p${p}b`;
  regs.push({ club_member_id: a, partner_member_id: b, status: "pending_payment", division_choices: [g] });
  regs.push({ club_member_id: b, partner_member_id: a, status: "pending_payment", division_choices: [g] });
}
regs.push({ club_member_id: "stale", partner_member_id: "g1p1a", status: "cancelled", division_choices: [1] });

const fmt = { kind: "round_robin" as const, pools: 1, swissRounds: 0, seeding: "entry_order" as const, schedule: { rule: "play_by" as const, deadline: "2026-11-30", dates: [] } };
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
  it("cross-league and decide-later plans are not guessed", () => {
    expect(proposeFormat({ format: { kind: "cross" } }, "Mens › A · Doubles").format.kind).toBeNull();
    expect(proposeFormat({ format: { kind: "pools", pools: "1" }, stages: [{ phase: "main", mode: "play_by", deadline: "2026-11-01" }] }, "Mens › A · Doubles").format)
      .toMatchObject({ kind: "round_robin", schedule: { rule: "play_by", deadline: "2026-11-01" } });
  });
});
