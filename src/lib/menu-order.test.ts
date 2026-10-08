import { describe, it, expect } from "vitest";
import { applyOrder, visibleOnly, normalisePrefs } from "./menu-order";

const id = (s: string) => s;
describe("menu order", () => {
  it("keeps default order without prefs", () => expect(applyOrder(["a", "b", "c"], undefined, id)).toEqual(["a", "b", "c"]));
  it("applies saved order and ignores items not visible", () => expect(applyOrder(["a", "b", "c"], ["c", "x", "a", "b"], id)).toEqual(["c", "a", "b"]));
  it("places new items after their default predecessor", () => expect(applyOrder(["a", "n", "b", "c"], ["c", "a", "b"], id)).toEqual(["c", "a", "n", "b"]));
  it("new first item goes to the top", () => expect(applyOrder(["n", "a", "b"], ["b", "a"], id)).toEqual(["n", "b", "a"]));
  it("hides only non-locked items", () => expect(visibleOnly(["a", "b", "c"], ["a", "c"], id, ["c"])).toEqual(["b", "c"]));
  it("normalises bad data", () => expect(normalisePrefs({ groups: { g: ["a", 1] }, hidden: "x" })).toEqual({ groups: { g: ["a"] }, hidden: [] }));
});
