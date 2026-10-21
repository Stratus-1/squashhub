import { describe, expect, it } from "vitest";
import { buildSwissProgression, buildProposedSwissGrid } from "@/lib/tournaments/swiss-progression-view";

const key = (a: string, b: string) => [a, b].sort().join("|");

/** n players, Round 1 complete (i v i+n/2), Round 2 partly played (only the first 2 games). */
function model(n: number, groups: number, round2Complete: boolean) {
  const seedOrder = Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const h = n / 2;
  const r1 = Array.from({ length: h }, (_, i) => ({ id: `r1-${i}`, round: 1, a: `p${i + 1}`, b: `p${i + 1 + h}`, winner: `p${i + 1}`, status: "completed" }));
  const r2 = Array.from({ length: h }, (_, i) => {
    const a = `p${i < h / 2 ? 2 * i + 1 : 2 * i + 1}`, b = `p${2 * i + 2}`;
    const done = round2Complete || i < 2;
    return { id: `r2-${i}`, round: 2, a, b, winner: done ? a : null, status: done ? "completed" : "scheduled" };
  });
  const m = buildSwissProgression({ seedOrder, names: {}, matches: [...r1, ...r2], totalRounds: 5 });
  m.rrFinish = { enabled: true, groups };
  return m;
}

function check(n: number, groups: number, round2Complete: boolean, exactMensCChart: boolean) {
  const m = model(n, groups, round2Complete);
  const grid = buildProposedSwissGrid(m, { exactMensCChart });
  const seen = new Set<string>();
  for (const r of [3, 4, 5]) {
    const rd = grid.rounds.find((x) => x.round === r)!;
    const groupGames = rd.blocks.filter((b) => (b.rows[0].pos ?? 99) <= groups * 4 || (b.rows[1].pos ?? 99) <= groups * 4);
    expect(groupGames).toHaveLength(groups * 2);
    for (const b of groupGames) {
      const [x, y] = [b.rows[0].pos!, b.rows[1].pos!];
      // Same group of four: 1–4, 5–8, 9–12, 13–16 — never cross-group.
      expect(Math.ceil(x / 4)).toBe(Math.ceil(y / 4));
      seen.add(key(b.rows[0].id!, b.rows[1].id!));
    }
    if (r === 3) {
      const byPos = groupGames.map((b) => [b.rows[0].pos, b.rows[1].pos].sort((a, c) => a! - c!).join("v"));
      expect(byPos).toContain("1v4");
      expect(byPos).toContain("2v3");
      expect(byPos).toContain("5v8");
      expect(byPos).toContain("6v7");
    }
  }
  expect(seen.size).toBe(groups * 6); // everyone meets the other three in their group exactly once
}

describe("Swiss + round robin finish — projected Rounds 3–5 stay within groups", () => {
  it.each([false, true])("represents all six Men's C residual positions in R3–5 (Round 2 complete: %s)", (complete) => {
    const m = model(18, 3, complete);
    const original = JSON.stringify(m);
    const grid = buildProposedSwissGrid(m, { exactMensCChart: true });
    for (const round of [3, 4, 5]) {
      const rd = grid.rounds.find((r) => r.round === round);
      expect(rd).toBeDefined();
      const positions = rd?.blocks.flatMap((b) => b.rows.map((r) => r.pos)).filter((p) => p != null).sort((a, b) => Number(a) - Number(b));
      expect(positions).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
      const rest = (rd?.blocks ?? []).filter((b) => Number(b.rows[0].pos) >= 13).map((b) => b.rows.map((r) => r.pos).join("v"));
      expect(rest).toEqual({ 3: ["13v17", "14v18", "15v16"], 4: ["13v15", "14v17", "16v18"], 5: ["13v14", "15v16", "17v18"] }[round]);
    }
    expect(JSON.stringify(m)).toBe(original);
  });
  it("Men's C 18 players, 3×4, Round 2 still in progress (provisional), even with the fixed 18-player chart", () => check(18, 3, false, true));
  it("Men's C 18 players, 3×4, Round 2 complete", () => check(18, 3, true, true));
  it("Men's D 16 players, 4×4, Round 2 still in progress", () => check(16, 4, false, false));
  it("Men's D 16 players, 4×4, Round 2 complete", () => check(16, 4, true, false));
});
