import { describe, it, expect } from "vitest";
import { canUseSmartBuilder } from "@/lib/smart-builder/access";

describe("Tournament Beta access", () => {
  it("super admin always", () => expect(canUseSmartBuilder({ isSuperAdmin: true })).toBe(true));
  it("beta club + tournament permission", () =>
    expect(canUseSmartBuilder({ isSuperAdmin: false, clubHasBeta: true, canManageTournaments: true })).toBe(true));
  it("non-beta club is closed", () =>
    expect(canUseSmartBuilder({ isSuperAdmin: false, clubHasBeta: false, canManageTournaments: true })).toBe(false));
  it("beta club without permission is closed", () =>
    expect(canUseSmartBuilder({ isSuperAdmin: false, clubHasBeta: true, canManageTournaments: false })).toBe(false));
});
