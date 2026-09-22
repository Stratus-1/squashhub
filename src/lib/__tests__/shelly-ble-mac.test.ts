import { describe, expect, it } from "vitest";
import { normalizeBleMac, resolveBleMac } from "../shelly-ble-mac";

describe("normalizeBleMac", () => {
  it("keeps a well-formed address", () => {
    expect(normalizeBleMac("dc:b4:d9:ce:aa:04")).toBe("DC:B4:D9:CE:AA:04");
  });

  it("repairs a dropped leading zero", () => {
    expect(normalizeBleMac("DC:B4:D9:CE:AA:6")).toBe("DC:B4:D9:CE:AA:06");
  });

  it("accepts an unseparated address", () => {
    expect(normalizeBleMac("dcb4d9ceaa04")).toBe("DC:B4:D9:CE:AA:04");
  });

  it("rejects junk", () => {
    expect(normalizeBleMac("")).toBeNull();
    expect(normalizeBleMac("not-a-mac")).toBeNull();
  });

  it("falls back to the Shelly device id", () => {
    expect(resolveBleMac(null, "dcb4d9ceaa04")).toBe("DC:B4:D9:CE:AA:04");
  });
});
