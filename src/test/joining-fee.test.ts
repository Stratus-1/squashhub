import { describe, expect, it } from "vitest";
import { decideJoiningClubFee } from "@/lib/joining-fee";

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
    // 22 Oct -> 1 Jan = ~2.3 months -> ceil = 3 months of R150
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
