import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/index.css", "utf8");
const tokens = (dark: boolean) => {
  const selector = dark ? ".dark .admin-contrast," : ".admin-contrast,";
  const block = css.slice(css.indexOf(selector)).split("{")[1].split("}")[0];
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([\d.]+) ([\d.]+)% ([\d.]+)%;/g)]
    .map((m) => [m[1], [Number(m[2]), Number(m[3]), Number(m[4])]]));
};
function rgb([h, s, l]: number[]) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map(n => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  });
}
function luminance(c: number[]) {
  return c.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    .reduce((total, v, i) => total + v * [.2126, .7152, .0722][i], 0);
}
function contrast(a: number[], b: number[]) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

describe.each([false, true])("Club Admin contrast (dark=%s)", dark => {
  const t = tokens(dark);
  it("keeps primary, secondary, statuses and disabled text AA-readable", () => {
    for (const surface of ["background", "card", "popover", "secondary", "muted"]) {
      for (const text of ["foreground", "muted-foreground", "warning-foreground", "win"]) {
        expect(contrast(rgb(t[text]), rgb(t[surface])), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(rgb(t.primary), rgb(t["primary-foreground"]))).toBeGreaterThanOrEqual(4.5);
    const selected = rgb(t.primary).map((v, i) => v * .15 + rgb(t.background)[i] * .85);
    expect(contrast(rgb(t.primary), selected)).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps field/switch boundaries distinguishable", () => {
    for (const surface of ["background", "card", "muted"]) {
      expect(contrast(rgb(t.input), rgb(t[surface]))).toBeGreaterThanOrEqual(3);
    }
  });
});