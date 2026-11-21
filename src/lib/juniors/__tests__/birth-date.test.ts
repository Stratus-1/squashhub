import { describe, expect, it } from "vitest";
import { isAcceptableJuniorBirthDate } from "../birth-date";

const today = new Date(2026, 10, 21); // 21 Nov 2026

describe("junior reminder birth date", () => {
  it("accepts a typical junior birth date", () => {
    expect(isAcceptableJuniorBirthDate("2010-05-14", today)).toBe(true);
  });
  it("rejects someone younger than 3", () => {
    expect(isAcceptableJuniorBirthDate("2024-01-01", today)).toBe(false);
  });
  it("rejects someone older than 25", () => {
    expect(isAcceptableJuniorBirthDate("2000-11-20", today)).toBe(false);
  });
  it("rejects impossible dates", () => {
    expect(isAcceptableJuniorBirthDate("2011-02-30", today)).toBe(false);
  });
});
