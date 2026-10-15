import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Riverside category selector presentation", () => {
  const source = readFileSync("src/pages/ClubChampsView.tsx", "utf8");
  const css = readFileSync("src/index.css", "utf8");
  it("scopes the prominent selector to embedded Riverside progression", () => {
    expect(source).toContain('pilotLayout && "riverside-category-selector"');
  });
  it("preserves accessible category selection with the design-system Button", () => {
    expect(source).toContain('aria-pressed={c.gn === activeCat.gn}');
    expect(source).toContain('onClick={() => setCatGroup(c.gn)}');
    expect(source).toContain('data-category-tone={index % 3}');
    expect(source).toContain('role="group" aria-label="Category"');
  });
  it("uses generous targets and a distinct selected/focus state without pills", () => {
    expect(css).toContain('min-height: 56px');
    expect(css).toContain('min-height: 64px');
    expect(css).toContain('.category-option[aria-pressed="true"]');
    expect(css).toContain('.category-option:focus-visible');
    expect(css).toContain('flex: 1 1 0');
  });
});