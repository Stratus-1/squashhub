import { beforeEach, describe, expect, it } from "vitest";
import { addToTab, loadOpenTab, openTabStorageKey, pruneTab, saveOpenTab, tabCount, tabTotal } from "@/lib/bar/open-tab";

describe("member open bar tab", () => {
  beforeEach(() => localStorage.clear());

  it("adds several products and quantities, and corrects/removes", () => {
    let t = {};
    t = addToTab(t, "beer", 1);
    t = addToTab(t, "beer", 1);
    t = addToTab(t, "coke", 1);
    expect(tabCount(t)).toBe(3);
    expect(tabTotal(t, { beer: 30, coke: 15 })).toBe(75);
    t = addToTab(t, "beer", -1);
    expect(t).toEqual({ beer: 1, coke: 1 });
    t = addToTab(t, "coke", -5);
    expect(t).toEqual({ beer: 1 });
  });

  it("persists per club+member and clears to zero after settlement", () => {
    const key = openTabStorageKey("club", "m1");
    saveOpenTab(key, { beer: 2 });
    expect(loadOpenTab(key)).toEqual({ beer: 2 });
    expect(loadOpenTab(openTabStorageKey("club", "m2"))).toEqual({});
    saveOpenTab(key, {});
    expect(localStorage.getItem(key)).toBeNull();
    expect(tabCount(loadOpenTab(key))).toBe(0);
  });

  it("ignores corrupt data and drops items no longer on sale", () => {
    localStorage.setItem("k", "{bad");
    expect(loadOpenTab("k")).toEqual({});
    expect(pruneTab({ a: 1, gone: 2 }, new Set(["a"]))).toEqual({ a: 1 });
  });
});
