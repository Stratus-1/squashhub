import { describe, expect, it } from "vitest";
import { shopPrice, specialError } from "./special-price";

const options = { special: { price: 1800, until: "2026-12-04" } };
describe("Footwear special", () => {
  it("charges R1800 rather than R2500 during the special", () => {
    expect(shopPrice(2500, options, new Date("2026-11-27T09:34:00Z"))).toBe(1800);
  });
  it("includes all of 4 December in Johannesburg", () => {
    expect(shopPrice(2500, options, new Date("2026-12-04T21:59:59Z"))).toBe(1800);
  });
  it("returns to R2500 after 4 December without modifying saved orders", () => {
    expect(shopPrice(2500, options, new Date("2026-12-04T22:00:00Z"))).toBe(2500);
  });
  it("uses the administrator's changed amount and end date", () => {
    expect(shopPrice(2500, { special: { price: 1700, until: "2026-12-08" } }, new Date("2026-12-07T10:00:00Z"))).toBe(1700);
  });
  it("requires a discounted price and an end date", () => {
    expect(specialError(2500, "2500", "2026-12-04")).not.toBeNull();
    expect(specialError(2500, "1800", "")).not.toBeNull();
    expect(specialError(2500, "1800", "2026-12-04")).toBeNull();
  });
});