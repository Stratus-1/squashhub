import { describe, it, expect } from "vitest";
import { appOrderDuplicates } from "./app-order-duplicates";

describe("appOrderDuplicates", () => {
  it("flags an item the customer already ordered on the app", () => {
    expect(appOrderDuplicates([{ bar_item_id: "bc", quantity: 1 }], [{ bar_item_id: "bc", item_name: "Black Crown 440ml Can", quantity: 1 }])).toEqual(["Black Crown 440ml Can"]);
  });
  it("does not flag a different item", () => {
    expect(appOrderDuplicates([{ bar_item_id: "steri", quantity: 1 }], [{ bar_item_id: "bc", item_name: "Black Crown", quantity: 1 }])).toEqual([]);
  });
});
