import { describe, it, expect } from "vitest";
import { tierFeeCents, entryDueCents, feeBreakdownLabel } from "@/lib/tournaments/entry-fee";
import { entrantFeeCents, basisProblem } from "@/lib/tournaments/entry-fees";
import { tiersFromFee } from "@/components/smart-builder/FeeBasisQuestion";

// Willem's example: 1 category R200, 2 categories R300.
const tiers = { "1": 20000, "2": 30000 };
const money = (c: number) => `R${c / 100}`;

describe("package price by number of categories", () => {
  it("one category costs R200", () => {
    expect(entryDueCents(20000, [1], [], tiers)).toBe(20000);
  });
  it("two categories cost R300, not R400", () => {
    expect(entryDueCents(20000, [1, 2], [], tiers)).toBe(30000);
  });
  it("more categories than the last row pay the last row's price", () => {
    expect(tierFeeCents(tiers, 4)).toBe(30000);
  });
  it("a doubles category the partner pays for does not count", () => {
    expect(entryDueCents(20000, [1, 2], [2], tiers)).toBe(20000);
  });
  it("without package prices the fee stays per category", () => {
    expect(entryDueCents(20000, [1, 2])).toBe(40000);
  });
  it("setup preview uses the package price", () => {
    const s = { basis: "tiered" as const, mixedRule: null, flatCents: 20000, tiers };
    expect(entrantFeeCents(s, { memberId: "a", divisions: [1, 2] })).toBe(30000);
    expect(basisProblem({ ...s, tiers: null })).toMatch(/package price/);
  });
  it("builder rows become prices for 1, 2, 3 categories", () => {
    expect(tiersFromFee("200", ["300", "350"])).toEqual({ "1": 20000, "2": 30000, "3": 35000 });
    expect(tiersFromFee("200", [""])).toBeNull();
  });
  it("label shows the package price", () => {
    expect(feeBreakdownLabel(20000, 2, money, tiers)).toBe("2 categories: R300");
  });
});
