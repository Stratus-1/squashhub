import { describe, expect, it } from "vitest";
import { chairmanCapabilityAllowed, chairmanMayChangeFinance, chairmanMayEditFeeCategories, isChairmanRole, FINANCIAL_PERMISSION_SLUGS } from "@/lib/chairman-permissions";

describe("Chairman financial view-only rules", () => {
  it("gives Vice Chairman the same Chairman financial restrictions", () => {
    for (const role of ["Vice Chairman", "vice-chairman", "Vice Chair"]) {
      expect(isChairmanRole(role)).toBe(true);
      expect(chairmanMayChangeFinance(isChairmanRole(role), false)).toBe(false);
      expect(chairmanMayEditFeeCategories(isChairmanRole(role), false)).toBe(true);
    }
    expect(isChairmanRole("Club Manager")).toBe(false);
  });
  it("recognises the Chairman role regardless of case", () => {
    expect(isChairmanRole(" Chairman ")).toBe(true);
    expect(isChairmanRole("Treasurer")).toBe(false);
  });
  it("denies Chairman financial changes even with club Full Admin", () => {
    expect(chairmanMayChangeFinance(true, false)).toBe(false);
  });
  it("preserves other finance staff and platform administrator authority", () => {
    expect(chairmanMayChangeFinance(false, false)).toBe(true);
    expect(chairmanMayChangeFinance(true, true)).toBe(true);
  });
  it("allows financial overview, banking and report viewing", () => {
    for (const cap of ["fin.overview.view", "fin.bank.view", "fin.reports.view"]) expect(chairmanCapabilityAllowed(cap)).toBe(true);
  });
  it("denies initiation, approval, reconciliation and billing including special approvals", () => {
    for (const cap of ["fin.initiate", "fin.approve", "fin.approve.treasurer_initiated", "fin.reconcile", "fin.billing"]) expect(chairmanCapabilityAllowed(cap)).toBe(false);
  });
  it("retains non-financial administration", () => {
    for (const cap of ["members.edit", "tournaments.manage", "courts.manage", "perm.manage"]) expect(chairmanCapabilityAllowed(cap)).toBe(true);
  });
  it("keeps banking setup outside transaction-only permission restrictions", () => {
    expect(FINANCIAL_PERMISSION_SLUGS).not.toContain("banking");
    expect(FINANCIAL_PERMISSION_SLUGS).toContain("finance");
    expect(chairmanMayChangeFinance(true, false)).toBe(false);
  });
});
describe("Chairman fee category editing", () => {
  it("lets the chairman add and edit fee categories without financial authority", () => {
    expect(chairmanMayEditFeeCategories(true, false)).toBe(true);
  });
  it("keeps fee editing for finance staff and blocks plain members", () => {
    expect(chairmanMayEditFeeCategories(false, true)).toBe(true);
    expect(chairmanMayEditFeeCategories(false, false)).toBe(false);
  });
});
