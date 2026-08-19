import { describe, expect, it } from "vitest";
import { computeFeeSplit } from "@/lib/tournaments/fee-split";

/** R100 entry, 3% platform fee, R10 federation levy, R5 association levy, R20 host. */
const base = {
  entryFeeCents: 10000,
  platformFeePct: 3,
  federationFeeCents: 1000,
  associationFeeCents: 500,
  hostFeeCents: 2000,
};

describe("ownership-aware fee split", () => {
  it("club owner pays both levies and keeps the residual", () => {
    const s = computeFeeSplit({ ...base, ownerKind: "club" });
    expect(s.platform).toBe(300);
    expect(s.federation).toBe(1000);
    expect(s.association).toBe(500);
    expect(s.host).toBe(2000);
    expect(s.owner).toBe(10000 - 300 - 1000 - 500 - 2000);
  });

  it("association owner is not charged an association levy", () => {
    const s = computeFeeSplit({ ...base, ownerKind: "association" });
    expect(s.associationApplies).toBe(false);
    expect(s.association).toBe(0);
    expect(s.federation).toBe(1000);
    expect(s.owner).toBe(10000 - 300 - 1000 - 2000);
  });

  it("federation owner is charged neither levy", () => {
    const s = computeFeeSplit({ ...base, ownerKind: "national" });
    expect(s.federationApplies).toBe(false);
    expect(s.associationApplies).toBe(false);
    expect(s.federation).toBe(0);
    expect(s.association).toBe(0);
    expect(s.owner).toBe(10000 - 300 - 2000);
  });

  it("supports percentage levies stacked on fixed amounts", () => {
    const s = computeFeeSplit({
      entryFeeCents: 20000,
      ownerKind: "club",
      federationFeeCents: 500,
      federationFeePct: 5,
      associationFeePct: 2.5,
    });
    expect(s.federation).toBe(500 + 1000);
    expect(s.association).toBe(500);
  });

  it("counts other expenses and flags over-allocation", () => {
    const s = computeFeeSplit({ ...base, ownerKind: "club", otherExpensesCents: 9000 });
    expect(s.other).toBe(9000);
    expect(s.overAllocated).toBe(true);
    expect(s.owner).toBe(0);
  });

  it("treats an unassigned owner as club-owned (legacy fallback)", () => {
    const s = computeFeeSplit({ ...base, ownerKind: null });
    expect(s.federationApplies).toBe(true);
    expect(s.associationApplies).toBe(true);
  });
});
