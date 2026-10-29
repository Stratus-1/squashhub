import { describe, expect, it } from "vitest";
import { applyManualPools, moveInPools } from "@/lib/smart-builder/pick-pool-preview";

describe("manual pool board", () => {
  it("keeps the organiser's saved pools exactly", () => {
    expect(applyManualPools([["a", "c"], ["b", "d"]], [["a", "b"], ["c", "d"]])).toEqual([["a", "b"], ["c", "d"]]);
  });
  it("drops withdrawn entries and adds new ones to the smallest pool", () => {
    expect(applyManualPools([["a", "c", "e"], ["b", "d"]], [["a", "b", "x"], ["c"]])).toEqual([["a", "b", "d"], ["c", "e"]]);
  });
  it("ignores a saved arrangement when the pool count changed", () => {
    expect(applyManualPools([["a"], ["b"], ["c"]], [["a", "b"], ["c"]])).toEqual([["a"], ["b"], ["c"]]);
  });
  it("moves a player to another pool before a chosen player", () => {
    expect(moveInPools([["a", "b"], ["c", "d"]], "a", 1, "d")).toEqual([["b"], ["c", "a", "d"]]);
  });
});
