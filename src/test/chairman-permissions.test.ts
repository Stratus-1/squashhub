import { describe, expect, it } from "vitest";
import { chairmanCapabilityAllowed, chairmanMayChangeFinance, isChairmanRole } from "@/lib/chairman-permissions";

describe("Chairman financial view-only rules", () => {
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
});