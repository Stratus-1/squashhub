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
  const undecided = new Set(m.rounds.flatMap((r) => r.fixtures.filter((f) => f.state === "scheduled").flatMap((f) => [f.a, f.b])));
  for (const r of [3, 4, 5]) {
    const rd = grid.rounds.find((x) => x.round === r)!;
    const groupGames = rd.blocks.filter((b) => (b.rows[0].pos ?? 99) <= groups * 4 || (b.rows[1].pos ?? 99) <= groups * 4);
    expect(groupGames).toHaveLength(groups * 2);
    for (const b of groupGames) {
      const [x, y] = [b.rows[0].pos!, b.rows[1].pos!];
      // Same group of four: 1–4, 5–8, 9–12, 13–16 — never cross-group.
      expect(Math.ceil(x / 4)).toBe(Math.ceil(y / 4));
      // A name may only appear where the position is settled — never a player whose game is undecided.
      for (const row of b.rows) if (row.id) expect(undecided.has(row.id)).toBe(false);
      if (b.rows[0].id && b.rows[1].id) seen.add(key(b.rows[0].id, b.rows[1].id));
    }
    if (r === 3) {
      const byPos = groupGames.map((b) => [b.rows[0].pos, b.rows[1].pos].sort((a, c) => a! - c!).join("v"));
      expect(byPos).toContain("1v4");
      expect(byPos).toContain("2v3");
      expect(byPos).toContain("5v8");
      expect(byPos).toContain("6v7");
    }
  }
  if (round2Complete) expect(seen.size).toBe(groups * 6); // everyone meets the other three in their group exactly once
  else expect(seen.size).toBe(0); // Round 2 undecided: with this many games open, no name is provably fixed
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
  it("blanks only the unsettled slots when a single Round 2 game is still open (the Andre v Wynand case)", () => {
    // R1: seed i beats i+9. R2: winners/losers paired off and decided, except p17 v p18.
    // Hand-verified: p1,p3,p5,p7 hold ranks 1-4 and p2,p4,p6,p8 hold ranks 5-8 under BOTH
    // outcomes of p17 v p18 (that game only moves their own and p8/p9-adjacent Buchholz),
    // while every position from 9 down changes with the result.
    const r1 = Array.from({ length: 9 }, (_, i) => ({ id: `r1-${i}`, round: 1, a: `p${i + 1}`, b: `p${i + 10}`, winner: `p${i + 1}`, status: "completed" }));
    const r2 = [
      ["p1", "p2"], ["p3", "p4"], ["p5", "p6"], ["p7", "p8"],
      ["p9", "p10"], ["p11", "p12"], ["p13", "p14"], ["p15", "p16"],
    ].map(([a, b], i) => ({ id: `r2-${i}`, round: 2, a, b, winner: a, status: "completed" }));
    r2.push({ id: "r2-open", round: 2, a: "p17", b: "p18", winner: null, status: "scheduled" });
    const m = buildSwissProgression({ seedOrder: Array.from({ length: 18 }, (_, i) => `p${i + 1}`), names: {}, matches: [...r1, ...r2], totalRounds: 5 });
    m.rrFinish = { enabled: true, groups: 3 };
    const grid = buildProposedSwissGrid(m, { exactMensCChart: true });
    const r3 = grid.rounds.find((r) => r.round === 3)!;
    const byPos = new Map(r3.blocks.flatMap((b) => b.rows.map((r) => [r.pos, r.id] as const)));
    // Settled positions keep their names: p1,p3,p5,p7,p9 are the 2-point cohort (p9's Buchholz
    // trails in both outcomes, so it holds 5th), and p2,p4,p6 hold 6-8 ahead of p8 either way.
    expect([byPos.get(1), byPos.get(2), byPos.get(3), byPos.get(4)]).toEqual(["p1", "p3", "p5", "p7"]);
    expect([byPos.get(5), byPos.get(6), byPos.get(7), byPos.get(8)]).toEqual(["p9", "p2", "p4", "p6"]);
    // p8 holds 9th in both outcomes (Buchholz 3 with a weaker tie-break when p17 wins, 2 when p18
    // wins — either way below p2,p4,p6 and above the rest). Everything from 10 down stays open,
    // and the undecided players never appear.
    expect(byPos.get(9)).toBe("p8");
    for (const pos of [10, 11, 12, 13, 14, 15, 16, 17, 18]) expect(byPos.get(pos)).toBeNull();
    expect([...byPos.values()]).not.toContain("p17");
    expect([...byPos.values()]).not.toContain("p18");
  });
  it("Men's C 18 players, 3×4, Round 2 still in progress (provisional), even with the fixed 18-player chart", () => check(18, 3, false, true));
  it("Men's C 18 players, 3×4, Round 2 complete", () => check(18, 3, true, true));
  it("Men's D 16 players, 4×4, Round 2 still in progress", () => check(16, 4, false, false));
  it("Men's D 16 players, 4×4, Round 2 complete", () => check(16, 4, true, false));
});
