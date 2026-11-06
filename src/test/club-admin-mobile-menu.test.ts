import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Phones must land on the Club Admin menu (pick a workspace), never straight
// into a workspace page. These guard the three pieces that make that true.
const src = readFileSync("src/pages/ClubAdmin.tsx", "utf8");

describe("Club Admin opens on the menu on phones", () => {
  it("defaults to no workspace on phones and keeps Features on desktop", () => {
    expect(src).toMatch(/searchParams\.get\("tab"\)\s*\|\|\s*\(typeof window !== "undefined" && window\.matchMedia\?\.\("\(\?max-width: 767px\)"\)\.matches \? "" : "features"\)/);
  });

  it("never replaces the empty 'show the menu' tab with a workspace", () => {
    const guard = src.match(/if \((.*?)\) \{\s*setActiveTab\(visibleTabs\[0\]\.value\);/s);
    expect(guard, "auto-switch guard found").toBeTruthy();
    expect(guard![1].trim().startsWith("activeTab &&")).toBe(true);
  });

  it("renders the workspace menu when no tab is selected", () => {
    expect(src).toMatch(/\{!activeTabMeta && \(\s*<section className="md:hidden">\s*<ClubAdminNavigation/);
  });
});
