import { describe, expect, it } from "vitest";
import { decideJoiningClubFee } from "@/lib/joining-fee";
import { computeJoinFee } from "@/lib/fee-proration";

// Joining fee rule (owner, Oct 2026): the pro-rata club fee is raised the
// moment a fee category is set for a new member application — by the member
// in the wizard or by an admin — and never twice.
describe("decideJoiningClubFee", () => {
  const base = {
    annualFee: 1800, // Day category at Uitsig, renewal 1 Jan
    dueMonth: 1,
    dueDay: 1,
    proRate: true,
    joinedAt: "2026-10-22T00:00:00Z",
    hasExistingClubFee: false,
    billingExempt: false,
  };

  it("raises the pro-rata club fee when a category is first selected", () => {
    const d = decideJoiningClubFee(base);
    expect(d.raise).toBe(true);
    // 22 Oct, renewal 1 Jan: Oct + Nov + Dec = 3 calendar months of R150
    expect(d.amount).toBe(450);
    expect(d.monthsCharged).toBe(3);
    expect(d.proRated).toBe(true);
  });

  it("never raises a second club fee when one already exists", () => {
    const d = decideJoiningClubFee({ ...base, hasExistingClubFee: true });
    expect(d.raise).toBe(false);
    expect(d.amount).toBe(0);
  });

  it("raises nothing for billing-exempt members", () => {
    const d = decideJoiningClubFee({ ...base, billingExempt: true });
    expect(d.raise).toBe(false);
  });

  it("raises nothing for zero-fee categories (Honorary, Club Committee, etc.)", () => {
    const d = decideJoiningClubFee({ ...base, annualFee: 0 });
    expect(d.raise).toBe(false);
  });

  it("charges the full annual fee within one month of renewal", () => {
    const d = decideJoiningClubFee({ ...base, joinedAt: "2026-12-15T00:00:00Z" });
    expect(d.raise).toBe(true);
    expect(d.amount).toBe(1800);
    expect(d.fullFee).toBe(true);
  });

  it("charges the full annual fee when the category has pro-rata switched off", () => {
    const d = decideJoiningClubFee({ ...base, proRate: false });
    expect(d.raise).toBe(true);
    expect(d.amount).toBe(1800);
    expect(d.proRated).toBe(false);
  });
});

// Pro-rata counts calendar months (owner, 11 Nov 2026): the join month counts
// in full; one month or less before renewal = full fee for the next season.
describe("computeJoinFee calendar months (renewal 1 Jan, R1,200/year)", () => {
  const at = (m: number, d: number, h = 0) => computeJoinFee(1200, 1, 1, true, new Date(2026, m - 1, d, h));

  it("charges 2 months for any November join", () => {
    for (const d of [1, 2, 15, 30]) {
      expect(at(11, d)).toEqual({ amount: 200, monthsCharged: 2, seasonYear: 2026, fullFee: false });
    }
    expect(at(11, 1, 0).monthsCharged).toBe(2);
  });

  it("charges the full year covering the next season for any December join", () => {
    for (const d of [1, 2, 15, 31]) {
      expect(at(12, d)).toEqual({ amount: 1200, monthsCharged: 12, seasonYear: 2027, fullFee: true });
    }
  });

  it("charges 3 months for an October join, including 31 October", () => {
    expect(at(10, 1).monthsCharged).toBe(3);
    expect(at(10, 31).amount).toBe(300);
  });

  it("counts months up to a 1 March renewal", () => {
    expect(computeJoinFee(1200, 3, 1, true, new Date(2026, 10, 15))).toMatchObject({ monthsCharged: 4, amount: 400, seasonYear: 2026 });
    expect(computeJoinFee(1200, 3, 1, true, new Date(2027, 1, 10))).toMatchObject({ fullFee: true, seasonYear: 2027 });
  });

  it("charges the full current-year fee when joining just after renewal", () => {
    expect(at(1, 5)).toMatchObject({ monthsCharged: 12, amount: 1200, seasonYear: 2026, fullFee: false });
  });
});
