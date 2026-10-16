import { describe, expect, it } from "vitest";
import { categoryLockKey, setCategoryLocked } from "@/lib/smart-builder/category-locks";

describe("category setup safety locks", () => {
  it("locks both Men's A pools with one category lock", () => {
    const locks = setCategoryLocked({}, "Mens A", true);
    expect(locks[categoryLockKey("Mens A::1", "Mens A")]).toBe(true);
    expect(locks[categoryLockKey("Mens A::2", "Mens A")]).toBe(true);
  });
  it("retains locks through save and reload", () => {
    expect(JSON.parse(JSON.stringify(setCategoryLocked({}, "Mens B", true)))).toEqual({ "Mens B": true });
  });
  it("unlocks only the selected category", () => {
    expect(setCategoryLocked({ "Mens A": true, "Mens B": true }, "Mens A", false)).toEqual({ "Mens A": false, "Mens B": true });
  });
  it("does not change the original lock state", () => {
    const locks = { "Mens A": true };
    setCategoryLocked(locks, "Mens A", false);
    expect(locks["Mens A"]).toBe(true);
  });
});