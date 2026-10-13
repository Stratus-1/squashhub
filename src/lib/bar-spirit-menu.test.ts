import { describe, expect, it } from "vitest";
import { withSpiritMixers } from "./bar-spirit-menu";
describe("standalone spirits mixers", () => {
  const spirit = { id: "spirit" }, buddy = { id: "buddy" }, bulk = { id: "bulk" };
  it("adds separate Buddy and bulk items", () => {
    expect(withSpiritMixers([spirit], [buddy, bulk], "spirits")).toEqual([spirit, buddy, bulk]);
  });
  it("preserves IDs without duplication", () => {
    expect(withSpiritMixers([spirit, buddy], [buddy, bulk], "custom_spirits")).toEqual([spirit, buddy, bulk]);
  });
  it("leaves unrelated categories alone", () => {
    const items = [spirit];
    expect(withSpiritMixers(items, [bulk], "shop")).toBe(items);
  });
});
