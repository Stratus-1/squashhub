import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Phones must land on the Club Admin menu (pick a workspace), never straight
// into a workspace page. These guard the three pieces that make that true.
const src = readFileSync("src/pages/ClubAdmin.tsx", "utf8");
const lines = src.split("\n");

describe("Club Admin opens on the menu on phones", () => {
  it("defaults to no workspace on phones and keeps Features on desktop", () => {
    const init = lines.find(l => l.includes("useState(() => searchParams.get(\"tab\")"));
    expect(init, "activeTab initializer found").toBeTruthy();
    expect(init).toContain("max-width: 767px");
    expect(init).toContain('? "" : "features"');
  });

  it("never replaces the empty 'show the menu' tab with a workspace", () => {
    const at = lines.findIndex(l => l.includes("setActiveTab(visibleTabs[0].value);"));
    expect(at, "auto-switch statement found").toBeGreaterThan(-1);
    const guard = lines.slice(0, at).reverse().find(l => l.trim().startsWith("if ("));
    expect(guard, "guarding if-statement found").toBeTruthy();
    expect(guard!.trim().startsWith("if (activeTab &&")).toBe(true);
  });

  it("renders the workspace menu when no tab is selected", () => {
    expect(src).toMatch(/\{!activeTabMeta && \(\s*<section className="md:hidden">\s*<ClubAdminNavigation/);
  });
});
