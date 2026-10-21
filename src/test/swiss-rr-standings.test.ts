import { describe, expect, it } from "vitest";
import { rrFinishStandings, type RrStandingMatch } from "@/lib/tournaments/swiss-rr-standings";
import { gameSetsOf } from "@/lib/tournaments/tie-breaks";

const snap = Array.from({ length: 18 }, (_, i) => `p${i + 1}`);
const m = (round: number, a: string, b: string, winner: string | null, score: string | null = null): RrStandingMatch =>
  ({ round, a, b, winner, score, status: winner ? "completed" : "scheduled" });
const run = (matches: RrStandingMatch[], criteria: any = ["game_difference", "games_won", "points_difference", "head_to_head"]) =>
  rrFinishStandings({ snapshot: snap, groups: 3, matches, criteria, gameSets: gameSetsOf as any });

describe("Round-robin standings — from Round 3", () => {
  it("18 players / 3 groups: only positions 1–12 shown; 13–18 stay Swiss", () => {
    const g = run([]);
    expect(g.map((x) => x.positions)).toEqual([[1, 4], [5, 8], [9, 12]]);
    expect(g.flatMap((x) => x.rows.map((r) => r.id))).not.toContain("p13");
    expect(g[0].rows.every((r) => r.played === 0)).toBe(true);
  });
  it("ignores Rounds 1–2 and cross-group games; pairing position 4 can rank 1", () => {
    const g = run([
      m(1, "p4", "p1", "p1", "3-0"), m(2, "p4", "p2", "p2", "3-0"), // Swiss qualifying: never counted
      m(3, "p4", "p1", "p4", "3-1"), m(3, "p2", "p3", "p2", "3-2"),
      m(4, "p4", "p2", "p4", "3-0"), m(4, "p1", "p3", null), // unplayed: not counted
      m(3, "p4", "p5", "p5", "3-0"), // other group: ignored
    ]);
    const top = g[0].rows[0];
    expect(top).toMatchObject({ id: "p4", pairingPosition: 4, rank: 1, played: 2, wins: 2, losses: 0, gamesWon: 6, gamesLost: 1 });
    expect(g[0].played).toBe(3);
    expect(g[0].rows.find((r) => r.id === "p1")).toMatchObject({ played: 1, wins: 0 });
  });
  it("updates after each round and follows the configured tie-break order", () => {
    const r3 = [m(3, "p1", "p4", "p1", "3-0"), m(3, "p2", "p3", "p2", "3-2")];
    expect(run(r3)[0].rows.map((r) => r.id)).toEqual(["p1", "p2", "p3", "p4"]); // game diff: p1 +3 before p2 +1
    // Head-to-head first: equal-win p1/p2 decided by their meeting, not game difference.
    const r4 = [...r3, m(4, "p1", "p3", "p3", "0-3"), m(4, "p2", "p4", "p4", "0-3"), m(5, "p1", "p2", "p2", "2-3")];
    expect(run(r4, ["head_to_head", "game_difference"])[0].rows[0].id).toBe("p2");
  });
  it("players level on everything share a rank", () => {
    const g = run([m(3, "p1", "p4", "p1", "3-0"), m(3, "p2", "p3", "p2", "3-0")], ["game_difference"]);
    expect(g[0].rows.slice(0, 2).map((r) => [r.rank, r.tied])).toEqual([[1, true], [1, true]]);
  });
  it("does not invent wins from incomplete, invalid-winner or later-stage matches", () => {
    const g = run([m(6, "p1", "p2", "p1", "3-0"), m(3, "p1", "p4", "p5", "3-0"), { ...m(4, "p1", "p3", "p1", "3-0"), status: "scheduled" }]);
    expect(g[0].played).toBe(0);
    expect(g[0].rows.every((r) => r.wins === 0 && r.played === 0)).toBe(true);
  });
});
