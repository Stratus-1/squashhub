import { describe, it, expect } from "vitest";
import { swissPreviewFinalsTemplate as template } from "@/lib/tournaments/swiss-preview-finals";
import { preferredSwissTemplate, strictSwissPlan, opponentKey } from "@/lib/tournaments/swiss-no-repeat";
import { buildProposedSwissGrid, buildSwissProgression } from "@/lib/tournaments/swiss-progression-view";

const pairsOf = (n: number, r: number) => template(n, r).pairs.map((p) => [p.a, p.b]);

describe("24-player preview follows the frozen chart (25 Oct 2026)", () => {
  it("R4 = 1v3, 2v4, 5v7, 6v8, 9v11, 10v12 in each half", () => {
    expect(pairsOf(24, 4)).toEqual([[1,3],[2,4],[5,7],[6,8],[9,11],[10,12],[13,15],[14,16],[17,19],[18,20],[21,23],[22,24]]);
  });
  it("R5 = 1v2, 3v5, 4v6, 7v8, 9v12, 10v11 in each half", () => {
    expect(pairsOf(24, 5)).toEqual([[1,2],[3,5],[4,6],[7,8],[9,12],[10,11],[13,14],[15,17],[16,18],[19,20],[21,24],[22,23]]);
  });
  it("preview and writer templates are identical for every size and round", () => {
    for (const n of [16, 18, 24]) for (let r = 1; r <= 5; r++) expect(template(n, r)).toEqual(preferredSwissTemplate(n, r));
  });
  it("five rounds: every position once per round, no earlier pair repeated", () => {
    const seen = new Set<string>();
    for (let r = 1; r <= 5; r++) {
      const pairs = template(24, r).pairs;
      expect(pairs.flatMap((p) => [p.a, p.b]).sort((a, b) => a - b)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
      for (const p of pairs) { const key = opponentKey(String(p.a), String(p.b)); expect(seen.has(key)).toBe(false); seen.add(key); }
    }
  });
  it("actual opponent history overrides the chart preference", () => {
    const plan = strictSwissPlan({ occupants: Array.from({ length: 24 }, (_, i) => `p${i + 1}`), round: 4, preferred: template(24, 4).pairs, usePreferredTemplate: true, history: [{ round: 3, a: "p1", b: "p3" }] });
    expect(plan.ready).toBe(true);
    expect(plan.pairs.some((p) => p.a === 1 && p.b === 3)).toBe(false);
  });
  it("saved 2v4 and 9v11 leave 1v3 and 10v12 in the preview, never 1v10 / 3v12", () => {
    const ids = Array.from({ length: 24 }, (_, i) => `p${i + 1}`);
    const tpl = (r: number) => preferredSwissTemplate(24, r).pairs;
    // Rounds 1-3 played by chart with the higher position always winning (positions stay put).
    const matches = [1, 2, 3].flatMap((r) => tpl(r).map((p, i) => ({ id: `r${r}-${i}`, round: r, a: ids[p.a - 1], b: ids[p.b - 1], winner: ids[p.a - 1], status: "completed" })));
    matches.push({ id: "r4-s1", round: 4, a: "p2", b: "p4", winner: null as any, status: "scheduled" });
    matches.push({ id: "r4-s2", round: 4, a: "p9", b: "p11", winner: null as any, status: "scheduled" });
    const model = buildSwissProgression({ seedOrder: ids, names: {}, matches: matches as any, totalRounds: 5, tieBreaks: ["position_swap"] });
    const r4 = buildProposedSwissGrid(model, { previewFinals: true }).rounds.find((r) => r.round === 4)!;
    const top = r4.blocks.map((b) => b.rows.map((r) => r.pos)).filter(([a]) => (a ?? 99) <= 12);
    expect(top).toEqual([[1,3],[2,4],[5,7],[6,8],[9,11],[10,12]]);
  });
});
