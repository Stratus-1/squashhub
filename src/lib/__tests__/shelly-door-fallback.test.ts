import { describe, expect, it } from "vitest";
import { shouldFallbackToShellyBle } from "../shelly-door";

describe("Shelly door BLE fallback policy", () => {
  it("does not bypass authentication or permission errors while offline", () => {
    expect(shouldFallbackToShellyBle({ context: { status: 401 }, message: "Failed to fetch" })).toBe(false);
    expect(shouldFallbackToShellyBle({ context: { status: 403 }, message: "Network request failed" })).toBe(false);
  });

  it("allows network outages and server errors", () => {
    expect(shouldFallbackToShellyBle(new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldFallbackToShellyBle({ context: { status: 503 } })).toBe(true);
  });
});
