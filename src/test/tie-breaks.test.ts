import { describe, it, expect } from "vitest";
import { rankUnits, gameSetsOf, tieIsMaterial, DEFAULT_TIE_BREAKS, type RankGame } from "@/lib/tournaments/tie-breaks";
import { sourcePositions, poolStandings } from "@/lib/tournaments/structured-persist";

const g = (a: string, b: string, winner: string, sets: Array<[number, number]>): RankGame => ({ a, b, winner, sets: sets.map(([x, y]) => ({ a: x, b: y })), pointsKnown: true });
const W3 = [[11, 5], [11, 5], [11, 5]] as Array<[number, number]>;

describe("tie-break engine", () => {
  it("1. tied on wins, separated by game difference → automatic, no manual prompt", () => {
    // a and b both 1 win; a won 3-0, b won 3-2.
    const games = [g("a", "c", "a", W3), g("b", "c", "b", [[11, 5], [5, 11], [11, 5], [5, 11], [11, 5]]), g("a", "b", "b", [[5, 11], [11, 5], [5, 11], [11, 5], [5, 11]]), g("c", "x", "x", W3.map(([p, q]) => [q, p]) as any)];
    const r = rankUnits(["a", "b", "c"], games.filter((x) => x.b !== "x"));
    expect(r.ties).toEqual([]);
    expect(r.order.slice(0, 2)).toEqual(["a", "b"]);
  });

  it("2. still level after game difference/games/points → head-to-head decides", () => {
    const w31: Array<[number, number]> = [[11, 5], [11, 5], [11, 5], [5, 11]];
    // a beat c 3-1, b beat a 3-1, d beat b 3-1 → a, b, d all on 1 win; d ahead on game difference;
    // a and b then level on game difference, games won and points → head-to-head (b beat a).
    const games = [g("a", "c", "a", w31), g("b", "a", "b", w31), g("d", "b", "d", w31)];
    const r = rankUnits(["a", "b", "c", "d"], games);
    const sa = r.stats.get("a")!, sb = r.stats.get("b")!;
    expect([sa.wins, sa.gamesWon - sa.gamesLost, sa.pointsFor - sa.pointsAgainst]).toEqual([sb.wins, sb.gamesWon - sb.gamesLost, sb.pointsFor - sb.pointsAgainst]);
    expect(r.order.indexOf("b")).toBeLessThan(r.order.indexOf("a"));
    expect(r.ties.find((t) => t.ids.includes("a"))).toBeUndefined();
  });

  it("5. 3-way tie is deterministic and only the still-level subset needs a decision", () => {
    // Perfect cycle with identical scores: a>b, b>c, c>a, all 3-0.
    const games = [g("a", "b", "a", W3), g("b", "c", "b", W3), g("c", "a", "c", W3), g("a", "d", "a", W3), g("b", "d", "b", W3), g("c", "d", "c", W3)];
    const r1 = rankUnits(["a", "b", "c", "d"], games);
    const r2 = rankUnits(["a", "b", "c", "d"], [...games].reverse());
    expect(r1.order).toEqual(r2.order);
    expect(r1.ties).toEqual([{ ids: ["a", "b", "c"], from: 1, to: 3 }]);
    expect(r1.order[3]).toBe("d");
  });

  it("7. manual fallback only when every criterion is equal; saved order then resolves it", () => {
    const games = [g("a", "b", "a", W3), g("b", "c", "b", W3), g("c", "a", "c", W3)];
    expect(rankUnits(["a", "b", "c"], games).ties).toHaveLength(1);
    const r = rankUnits(["a", "b", "c"], games, DEFAULT_TIE_BREAKS, ["c", "a", "b"]);
    expect(r.ties).toEqual([]);
    expect(r.order).toEqual(["c", "a", "b"]);
    // A manual order never overrides a real difference in wins.
    const r2 = rankUnits(["a", "b", "c", "d"], [...games, g("a", "d", "a", W3)], DEFAULT_TIE_BREAKS, ["d", "c", "b", "a"]);
    expect(r2.order[0]).toBe("a");
  });

  it("points difference is skipped (never guessed) when a game has no per-game scores", () => {
    expect(gameSetsOf({ score: "3-1" })).toEqual({ sets: [{ a: 1, b: 0 }, { a: 1, b: 0 }, { a: 1, b: 0 }, { a: 0, b: 1 }], pointsKnown: false });
    expect(gameSetsOf({ score: "11-5, 9-11" }).pointsKnown).toBe(true);
    const games: RankGame[] = [{ a: "a", b: "c", winner: "a", sets: [{ a: 1, b: 0 }, { a: 1, b: 0 }, { a: 1, b: 0 }], pointsKnown: false }, g("b", "c", "b", [[11, 0], [11, 0], [11, 0]])];
    const r = rankUnits(["a", "b", "c"], games, ["points_difference"]);
    expect(r.ties[0]?.ids).toEqual(["a", "b"]);
  });

  it("materiality: only ties touching positions the next stage reads", () => {
    const top2 = (p: number) => p <= 2;
    expect(tieIsMaterial({ ids: ["x", "y"], from: 2, to: 3 }, top2)).toBe(true);
    expect(tieIsMaterial({ ids: ["x", "y"], from: 1, to: 2 }, top2)).toBe(true);
    expect(tieIsMaterial({ ids: ["x", "y"], from: 3, to: 4 }, top2)).toBe(false);
  });
});

/* ── through the real progression functions ── */
const row = (a: string, b: string, winner: string, score: string, extra: Record<string, any> = {}) => {
  const [pa, qa] = a.split("+"), [pb, qb] = b.split("+");
  return { stage_key: "rr", pool_number: 1, player_a_member_id: pa, partner_a_member_id: qa ?? null, player_b_member_id: pb, partner_b_member_id: qb ?? null, winner_member_id: winner.split("+")[0], score, status: "completed", ...extra };
};
const div = (ids: string[]) => ({ divisionId: "d", label: "Men A", entrants: ids.map((id, i) => ({ id, rank: i + 1 })), stages: [], unit: "players" } as any);
const src = { id: "rr", order: 0, kind: "round_robin", name: "Pools" } as any;

describe("tie-breaks in qualification", () => {
  // p1 3 wins; p2, p3, p4 each 1 win in a perfect cycle with identical 3-0 scores.
  const cycle = [row("p1", "p2", "p1", "11-5, 11-5, 11-5"), row("p1", "p3", "p1", "11-5, 11-5, 11-5"), row("p1", "p4", "p1", "11-5, 11-5, 11-5"),
    row("p2", "p3", "p2", "11-5, 11-5, 11-5"), row("p3", "p4", "p3", "11-5, 11-5, 11-5"), row("p4", "p2", "p4", "11-5, 11-5, 11-5")];

  it("3. tie across the qualification cutoff blocks only while unresolved", () => {
    const used = new Set(["0:1", "0:2"]);
    expect(() => sourcePositions(div(["p1", "p2", "p3", "p4"]), src, cycle, null, used)).toThrow(/still tied after Wins → Game difference/);
    const out = sourcePositions(div(["p1", "p2", "p3", "p4"]), src, cycle, { 0: ["p1", "p3", "p2", "p4"] }, used);
    expect(out[0].slice(0, 2)).toEqual(["p1", "p3"]);
  });

  it("4. tie among non-qualifying positions does not block", () => {
    // p1 and p2 clear; p3 and p4 level on everything, only top 2 used.
    const rows = [row("p1", "p2", "p1", "11-5, 11-5, 11-5"), row("p1", "p3", "p1", "11-5, 11-5, 11-5"), row("p1", "p4", "p1", "11-5, 11-5, 11-5"),
      row("p2", "p3", "p2", "11-5, 11-5, 11-5"), row("p2", "p4", "p2", "11-5, 11-5, 11-5"), row("p3", "p4", "p3", "11-5, 11-5, 11-5", { winner_member_id: null, status: "completed" })];
    expect(() => sourcePositions(div(["p1", "p2", "p3", "p4"]), src, rows, null, new Set(["0:1", "0:2"]))).not.toThrow();
    expect(() => poolStandings("d", "rr", rows, 2)).not.toThrow();
    expect(() => poolStandings("d", "rr", rows, 4)).toThrow(/still tied/);
  });

  it("6. doubles pairs are ranked as one unit", () => {
    // Cycle on wins: a beat b 3-0, b beat c 3-0 (partner b2 recorded as winner), c beat a 3-2 → game difference a +2, b 0, c -2.
    const rows = [row("a1+a2", "b1+b2", "a1", "11-5, 11-5, 11-5"), row("b1+b2", "c1+c2", "b2", "11-5, 11-5, 11-5"), row("c1+c2", "a1+a2", "c1", "11-5, 5-11, 11-5, 5-11, 11-5")];
    // b2 (partner) won one game — credited to the b pair.
    const out = sourcePositions({ ...div(["a1+a2", "b1+b2", "c1+c2"]), unit: "pairs" }, src, rows, null, new Set(["0:1", "0:2"]));
    expect(out[0]).toEqual(["a1+a2", "b1+b2", "c1+c2"]);
  });

  it("8. ranking never modifies stored results", () => {
    const snap = JSON.stringify(cycle);
    try { sourcePositions(div(["p1", "p2", "p3", "p4"]), src, cycle, null, new Set(["0:1", "0:2"])); } catch { /* blocked */ }
    poolStandings("d", "rr", cycle, 1);
    expect(JSON.stringify(cycle)).toBe(snap);
  });
});
