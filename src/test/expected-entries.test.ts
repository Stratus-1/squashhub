import { describe, it, expect } from "vitest";
import { categoryEstimate, estimateConflicts, resolveEstimate, setEstimate } from "@/lib/smart-builder/expected-entries";

// Mirrors the reported screenshots: Structure guide 13/14/14/16/18 vs Expected entries 14/16/16/16/18.
const legacy = () => ({
  subcats: {} as Record<string, string[]>,
  guide: { expected: { "Men's A": "13", "Men's B": "14", "Men's C": "14", "Men's D": "16", Ladies: "18" } },
  unitEntries: { "Men's A": "14", "Men's B": "16", "Men's C": "16", "Men's D": "16", Ladies: "18" },
});
const cats = ["Men's A", "Men's B", "Men's C", "Men's D", "Ladies"];

describe("canonical expected entries", () => {
  it("flags conflicting legacy estimates without changing either", () => {
    const a = legacy();
    expect(estimateConflicts(a, cats).map((c) => c.cat)).toEqual(["Men's A", "Men's B", "Men's C"]);
    expect(a.guide.expected["Men's A"]).toBe("13");
    expect(categoryEstimate(a, "Men's A")).toBe(14); // planning keeps the later explicit answer until resolved
  });
  it("resolving records an audit and clears the conflict", () => {
    const a = legacy();
    const c = estimateConflicts(a, cats)[0];
    const r = resolveEstimate(a, c, "guide", "2026-10-11T00:00:00Z");
    expect(categoryEstimate(r, "Men's A")).toBe(13);
    expect(r.guide.estimateResolutions["Men's A"]).toEqual({ chosen: 13, guide: 13, steps: 14, at: "2026-10-11T00:00:00Z" });
    expect(estimateConflicts(r, cats).map((x) => x.cat)).not.toContain("Men's A");
  });
  it("editing keeps one value: category mirror equals subcategory total", () => {
    let a: any = { subcats: { Men: ["A", "B"] }, unitEntries: {}, guide: {} };
    a = setEstimate(a, "Men", "Men::A", "8");
    a = setEstimate(a, "Men", "Men::B", "6");
    expect(categoryEstimate(a, "Men")).toBe(14);
    expect(a.guide.expected.Men).toBe("14");
    expect(estimateConflicts(a, ["Men"])).toEqual([]);
  });
  it("new drafts and 'not yet' drafts have no conflicts", () => {
    expect(estimateConflicts({ guide: {}, unitEntries: {} }, cats)).toEqual([]);
    expect(categoryEstimate({ guide: { expected: { Ladies: "9" } } }, "Ladies")).toBe(9);
  });
  it("subcategory conflicts can only keep group totals", () => {
    const a = { subcats: { Men: ["A"] }, unitEntries: { "Men::A": "10" }, guide: { expected: { Men: "12" } } };
    const c = estimateConflicts(a, ["Men"])[0];
    expect(() => resolveEstimate(a, c, "guide")).toThrow();
    expect(estimateConflicts(resolveEstimate(a, c, "steps"), ["Men"])).toEqual([]);
  });
});
