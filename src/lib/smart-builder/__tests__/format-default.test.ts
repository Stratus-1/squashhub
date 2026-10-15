import { describe, it, expect } from "vitest";
import { formatSource, setCategoryFormat, resetCategoryFormat, unsetCategories } from "../format-default";

const base = { format: { kind: "swiss", swissRounds: "5" }, formatOverrides: {} as Record<string, any> };

describe("tournament default format", () => {
  it("every category inherits the default without clicking any recommendation", () => {
    expect(["Mens A", "Ladies A"].map((k) => formatSource(base, k))).toEqual(["default", "default"]);
    expect(unsetCategories(base, ["Mens A"])).toEqual([]);
  });
  it("no default and no override is reported as unset, never silently filled", () => {
    expect(unsetCategories({ format: { kind: null } }, ["Mens A"])).toEqual(["Mens A"]);
  });
  it("a different choice becomes an explicit override; others unchanged", () => {
    const n = setCategoryFormat(base, "Ladies A", { kind: "round_robin" });
    expect(formatSource(n, "Ladies A")).toBe("override");
    expect(formatSource(n, "Mens A")).toBe("default");
    expect(Object.keys(n.formatOverrides!)).toEqual(["Ladies A"]);
  });
  it("choosing the same as the default stores no redundant override", () => {
    expect(setCategoryFormat(base, "Mens A", { kind: "swiss", swissRounds: "5" }).formatOverrides).toEqual({});
  });
  it("reset returns to the default; existing saved overrides preserved", () => {
    const saved = { ...base, formatOverrides: { "Mens B": { kind: "swiss", swissRounds: "5" }, "Ladies B": { kind: "pools" } } };
    expect(resetCategoryFormat(saved, "Ladies B").formatOverrides).toEqual({ "Mens B": { kind: "swiss", swissRounds: "5" } });
    expect(formatSource(saved, "Mens B")).toBe("override");
  });
  it("survives a save/reload round-trip", () => {
    const n = setCategoryFormat(base, "Ladies A", { kind: "round_robin" });
    const r = JSON.parse(JSON.stringify(n));
    expect(formatSource(r, "Ladies A")).toBe("override");
    expect(formatSource(r, "Mens A")).toBe("default");
  });
  it("subcategories follow a category override", () => {
    expect(formatSource({ ...base, formatOverrides: { Mens: { kind: "pools" } } }, "Mens::A")).toBe("category");
  });
});
