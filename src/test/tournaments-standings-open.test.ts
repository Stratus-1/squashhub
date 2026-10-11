import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("Tournaments page Standings tab", () => {
  const src = readFileSync("src/pages/Tournaments.tsx", "utf8");
  it("opens the only current tournament's standings directly when Standings is chosen", () => {
    expect(src).toContain('if (v === "standings" && singleChampId) { navigate(`/club-champs/${singleChampId}?view=standings`); return; }');
    expect(src).toContain("onValueChange={selectChampTab}");
  });
  it("counts tournaments (not category entries) from the current list only, and never auto-redirects on load", () => {
    expect(src).toContain("const singleChampId = champs.length === 1");
    expect(src).not.toContain("sh.autoOpenChamp");
    expect(src).not.toContain("Opening standings");
  });
});
