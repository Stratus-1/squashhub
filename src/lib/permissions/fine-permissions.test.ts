import { describe, expect, it } from "vitest";
import { expandPermissions, hasPermissionArea, normaliseSelection, permissionGranted } from "./fine-permissions";

describe("finer permissions", () => {
  it("existing whole-area grant keeps every part (nobody loses access)", () => {
    expect(permissionGranted(["finance"], "finance.reverse")).toBe(true);
    expect(permissionGranted(["bar"], "bar.cashup")).toBe(true);
    expect(permissionGranted(["members"], "members.status")).toBe(true);
  });

  it("a part never grants the whole area or another part", () => {
    expect(permissionGranted(["finance.view"], "finance")).toBe(false);
    expect(permissionGranted(["finance.enter"], "finance.reverse")).toBe(false);
    expect(permissionGranted(["champs.results"], "champs.setup")).toBe(false);
  });

  it("any part of an area allows viewing that area", () => {
    expect(permissionGranted(["finance.payroll"], "finance.view")).toBe(true);
    expect(permissionGranted(["bar.stocktake"], "bar.view")).toBe(true);
    expect(permissionGranted(["bar.stocktake"], "finance.view")).toBe(false);
  });

  it("view-only finance cannot enter, approve, delete or import", () => {
    for (const s of ["finance.enter", "finance.approve", "finance.reverse", "finance.bank", "finance.billing", "finance.payroll"]) {
      expect(permissionGranted(["finance.view"], s)).toBe(false);
    }
  });

  it("expands grants and reports area access", () => {
    const e = expandPermissions(["members.edit"]);
    expect(e.has("members.view")).toBe(true);
    expect(e.has("members")).toBe(false);
    expect(hasPermissionArea(["members.edit"], "members")).toBe(true);
    expect(hasPermissionArea(["finance"], "members")).toBe(false);
  });

  it("drops parts when the whole area is ticked", () => {
    expect(normaliseSelection(["finance", "finance.enter", "bar.cashup"]).sort()).toEqual(["bar.cashup", "finance"]);
  });
});
