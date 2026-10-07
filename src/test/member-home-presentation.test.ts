import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync("src/pages/Dashboard.tsx", "utf8");
const mobile = dashboard.slice(dashboard.indexOf('<div className="member-home bottom-nav-safe'));
const css = readFileSync("src/index.css", "utf8");
const header = readFileSync("src/components/PageHeader.tsx", "utf8");

function rgb(h: number, s: number, l: number) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map(n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); });
}
function luminance(c: number[]) { return c.reduce((sum, v, i) => sum + (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i], 0); }
function contrast(a: number[], b: number[]) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }

describe("Member home presentation boundary", () => {
  it("raises My Stats above features and keeps rankings after them", () => {
    expect(mobile.indexOf("<MyStatsCard")).toBeLessThan(mobile.indexOf("member-feature-grid"));
    expect(mobile.indexOf("<MyRankingsCard")).toBeGreaterThan(mobile.indexOf("member-feature-grid"));
  });
  it("deduplicates permanent shortcuts, retaining fallback tiles and admin permissions", () => {
    const grid = mobile.slice(mobile.indexOf("member-feature-grid"), mobile.indexOf("{/* Arrears"));
    expect(grid).not.toContain("My Account");
    expect(grid).not.toContain("Help &amp; Tutorials");
    expect(grid).toContain("bookingsEnabled && !shortcutFlags.bookingsEnabled");
    expect(grid).toContain("!shortcutFlags.honestyBarEnabled");
    expect(grid).toContain("{hasAnyAdminAccess && (");
    for (const path of ["/ladder", "/events", "/league-games", "/tournaments", "/match-marker", "/club-admin"]) expect(grid).toContain(path);
  });
  it("keeps controls and alerts unchanged and exposes opt-in header help", () => {
    expect(mobile).toContain("<DashboardDeviceControls />");
    expect(mobile).toContain("<MemberSuspensionBanner />");
    expect(mobile).toContain("<DebitOrderPromptCard");
    expect(header).toContain("showHelp = false");
    expect(header).toContain('aria-label="Help & Tutorials"');
    expect(header).toContain('navigate("/help")');
  });
  it.each([false, true])("keeps labels AA and coloured icons distinct in dark=%s", dark => {
    const selector = dark ? ".dark .member-home, .dark .member-bottom-nav {" : ".member-home, .member-bottom-nav {";
    const block = css.slice(css.indexOf(selector)).split("{")[1].split("}")[0];
    const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([\d.]+) ([\d.]+)% ([\d.]+)%;/g)].map(m => [m[1], rgb(Number(m[2]), Number(m[3]), Number(m[4]))]));
    const card = dark ? rgb(220, 15, 22) : rgb(0, 0, 100);
    const background = dark ? rgb(220, 25, 6) : rgb(220, 15, 97);
    expect(contrast(tokens["muted-foreground"], card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens["muted-foreground"], background)).toBeGreaterThanOrEqual(4.5);
    for (const [name, colour] of Object.entries(tokens).filter(([name]) => name.startsWith("member-"))) {
      expect(contrast(colour, card), name).toBeGreaterThanOrEqual(4.5);
      const tint = card.map((c, i) => c * .9 + colour[i] * .1);
      expect(contrast(colour, tint), `${name} hover`).toBeGreaterThanOrEqual(4.5);
    }
  });
});