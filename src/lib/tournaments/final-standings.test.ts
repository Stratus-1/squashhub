import { describe, it, expect } from "vitest";
import { computeFinalPlacements, type PlacementMatch } from "./final-standings";

const team = (i: number) => ({ p: `p${i}`, q: `q${i}` });
const final = (n: number, a: number, b: number, winner: "a" | "b" | null, status = "completed"): PlacementMatch => ({
  id: `f${n}`, stage: "playoff_final", status, group_number: 1, bracket_position: 1000 + n,
  player_a_member_id: team(a).p, partner_a_member_id: team(a).q,
  player_b_member_id: team(b).p, partner_b_member_id: team(b).q,
  winner_member_id: winner === "a" ? team(a).p : winner === "b" ? team(b).q : null,
});
const pool: PlacementMatch[] = [
  { stage: "group", status: "completed", group_number: 1, bracket_position: null, player_a_member_id: "p1", player_b_member_id: "p2", winner_member_id: "p1" },
];

describe("final overall standings lifecycle", () => {
  it("pool play only → no final table", () => {
    expect(computeFinalPlacements(pool, 1, 12)).toBeNull();
  });

  it("play-offs incomplete → no final table", () => {
    const ms = [...pool, final(1, 1, 2, "a"), final(2, 3, 4, null, "scheduled")];
    expect(computeFinalPlacements(ms, 1, 4)).toBeNull();
  });

  it("all placement play-offs complete → 1..N from play-off outcomes, pairs intact", () => {
    // Pool A #n = team n (odd), Pool B #n = team n+6
    const ms = [...pool,
      final(1, 1, 7, "b"), final(2, 2, 8, "b"), final(3, 3, 9, "a"),
      final(4, 4, 10, "b"), final(5, 5, 11, "b"), final(6, 6, 12, "b")];
    const r = computeFinalPlacements(ms, 1, 12)!;
    expect(r.map((x) => x.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(r.map((x) => x.player_member_id)).toEqual(
      ["p7", "p1", "p8", "p2", "p3", "p9", "p10", "p4", "p11", "p5", "p12", "p6"]);
    for (const x of r) expect(x.partner_member_id).toBe(x.player_member_id.replace("p", "q"));
  });

  it("does not use pool order when a lower seed wins", () => {
    const r = computeFinalPlacements([final(1, 1, 2, "b")], 1, 2)!;
    expect(r[0].player_member_id).toBe("p2");
  });

  it("missing slot, duplicate team or wrong team count → stays on pool view", () => {
    expect(computeFinalPlacements([final(1, 1, 2, "a"), final(3, 3, 4, "a")], 1)).toBeNull();
    expect(computeFinalPlacements([final(1, 1, 2, "a"), final(2, 1, 3, "a")], 1)).toBeNull();
    expect(computeFinalPlacements([final(1, 1, 2, "a")], 1, 4)).toBeNull();
  });

  it("is scoped to its league", () => {
    const other = { ...final(1, 1, 2, "a"), group_number: 2, bracket_position: 2001 };
    expect(computeFinalPlacements([other], 1)).toBeNull();
  });
});
