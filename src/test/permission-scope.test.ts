import { describe, it, expect } from "vitest";
import { permissionSlugsForTenant, permissionLabel } from "@/lib/permission-scope";

describe("permission scope", () => {
  it("keeps every slug for clubs", () => {
    const club = permissionSlugsForTenant(false).map(s => s.value);
    expect(club).toContain("courts");
    expect(club).toContain("bar");
  });

  it("hides club-only slugs for associations", () => {
    const assoc = permissionSlugsForTenant(true).map(s => s.value);
    for (const s of ["courts", "bar", "access", "ladder", "visitors", "ops_booking"]) {
      expect(assoc).not.toContain(s);
    }
    expect(assoc).toContain("leagues");
    expect(assoc).toContain("fees");
  });

  it("relabels club wording for associations", () => {
    expect(permissionLabel("club", true)).toBe("Association Info");
    expect(permissionLabel("club", false)).toBe("Club Info");
  });
});
