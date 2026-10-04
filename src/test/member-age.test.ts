import { describe, it, expect } from "vitest";
import { resolveAge, checkAgeGate, dobFromSaId } from "@/lib/member-age";

const now = new Date(Date.UTC(2026, 9, 3));

describe("member age gate", () => {
  it("derives age from SA ID with century rule", () => {
    expect(resolveAge({ idNumbers: ["8001015009087"] }, now)).toBe(46);
    expect(resolveAge({ idNumbers: ["1010105009087"] }, now)).toBe(15);
  });
  it("respects birthday boundary", () => {
    expect(resolveAge({ dob: "2008-10-03" }, now)).toBe(18);
    expect(resolveAge({ dob: "2008-10-04" }, now)).toBe(17);
  });
  it("accepts a bare 6-digit YYMMDD birth date", () => {
    expect(resolveAge({ idNumbers: ["800101"] }, now)).toBe(46);
    expect(resolveAge({ idNumbers: ["101010"] }, now)).toBe(15);
    expect(dobFromSaId("801332", now)).toBeNull();
  });
  it("returns null for missing/invalid data, never underage", () => {
    expect(resolveAge({ idNumbers: [null, "123"] }, now)).toBeNull();
    expect(dobFromSaId("8013325009087", now)).toBeNull();
    expect(checkAgeGate(18, null)).toEqual({ allowed: false, reason: "age_unknown", age: null });
  });
  it("no restriction allows everyone", () => {
    expect(checkAgeGate(null, null)).toEqual({ allowed: true });
    expect(checkAgeGate(18, 17)).toMatchObject({ allowed: false, reason: "underage" });
    expect(checkAgeGate(18, 18)).toEqual({ allowed: true });
  });
});
