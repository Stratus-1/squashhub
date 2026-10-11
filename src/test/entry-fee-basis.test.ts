import { describe, it, expect } from "vitest";
import { feeTotals, entrantFeeCents, basisProblem, allocatePayment } from "@/lib/tournaments/entry-fees";

const flat = { flatCents: 10000, divisionFees: { "1": 10000, "2": 10000, "3": 10000 } };
// 3 people, 4 category entries (one dual-category entrant)
const entrants = [
  { memberId: "a", divisions: [1] },
  { memberId: "b", divisions: [2, 3] },
  { memberId: "c", divisions: [3] },
];

describe("entry fee basis", () => {
  it("null basis = needs confirmation, no totals", () => {
    const s = { ...flat, basis: null, mixedRule: null };
    expect(basisProblem(s)).toMatch(/Needs confirmation/);
    expect(feeTotals(s, entrants)).toEqual({ uniquePlayers: 3, categoryEntries: 4, totalCents: null });
  });
  it("once per player charges dual entrant once", () => {
    const s = { ...flat, basis: "per_player" as const, mixedRule: null };
    expect(feeTotals(s, entrants).totalCents).toBe(30000);
  });
  it("per category charges each entry", () => {
    const s = { ...flat, basis: "per_category" as const, mixedRule: null };
    expect(feeTotals(s, entrants).totalCents).toBe(40000);
  });
  it("mixed fees + per player requires an explicit rule", () => {
    const s = { flatCents: 15000, divisionFees: { "1": 10000, "2": 15000, "3": 5000 }, basis: "per_player" as const, mixedRule: null };
    expect(basisProblem(s)).toMatch(/different fees/);
    expect(entrantFeeCents(s, entrants[1])).toBeNull();
    expect(entrantFeeCents({ ...s, mixedRule: "highest" }, entrants[1])).toBe(15000);
    expect(entrantFeeCents({ ...s, mixedRule: "first" }, { memberId: "b", divisions: [3, 2] })).toBe(5000);
  });
  it("merges duplicate rows per member id, never by email", () => {
    const s = { ...flat, basis: "per_player" as const, mixedRule: null };
    const t = feeTotals(s, [{ memberId: "x", divisions: [1] }, { memberId: "x", divisions: [2] }, { memberId: "y", divisions: [1] }]);
    expect(t).toEqual({ uniquePlayers: 2, categoryEntries: 3, totalCents: 20000 });
  });
  it("family payment split leaves excess as credit, never overpays a fee", () => {
    const r = allocatePayment(25000, [{ memberId: "dad", dueCents: 10000 }, { memberId: "kid", dueCents: 10000 }]);
    expect(r.lines.map((l) => l.appliedCents)).toEqual([10000, 10000]);
    expect(r.creditCents).toBe(5000);
    const short = allocatePayment(15000, [{ memberId: "a", dueCents: 10000 }, { memberId: "b", dueCents: 10000 }]);
    expect(short.lines[1].stillDueCents).toBe(5000);
    expect(short.creditCents).toBe(0);
  });
});
