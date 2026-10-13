import { describe, expect, it } from "vitest";
import { spiritMixers, withSpiritMixers } from "./bar-spirit-menu";
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
  it("uses real Buddies and the bulk serving, not the inventory container or specials", () => {
    const bottle = { id: "buddy", name: "Buddies", price: 22 };
    const container = { id: "bulk", name: "Coke Bulk", item_kind: "stock" };
    const serving = { id: "glass", name: "Coke Bulk · Glass 250ml", stock_parent_id: "bulk" };
    expect(spiritMixers([bottle, container, serving,
      { id: "choc", name: "Chocolates" },
      { id: "special", name: "Double Brandy plus Buddy", item_kind: "special" },
    ])).toEqual([bottle, serving]);
  });
});
