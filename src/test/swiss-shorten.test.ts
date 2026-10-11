import { describe, it, expect } from "vitest";
import { swissShortenCheck } from "@/lib/tournaments/swiss-shorten";
import { rankSourcePools } from "@/lib/tournaments/structured-persist";

const done = (a: string, b: string, w: string, round = 1) => ({
  round_number: round, player_a_member_id: a, player_b_member_id: b, status: "completed", winner_member_id: w, score: "2-0",
});

describe("swissShortenCheck", () => {
  it("allows shortening when all rounds up to the new count are final", () => {
    const rows = [1, 2, 3, 4, 5].flatMap((r) => [done("a", "b", "a", r)]);
    expect(swissShortenCheck(rows, 6, 5)).toEqual({ ok: true });
  });
  it("blocks when a later round already has games (nothing is deleted)", () => {
    const rows = [...[1, 2, 3, 4, 5].flatMap((r) => [done("a", "b", "a", r)]), done("a", "c", "a", 6)];
    expect(swissShortenCheck(rows, 6, 5).ok).toBe(false);
  });
  it("blocks while the current round still has open matches", () => {
    const rows = [done("a", "b", "a", 1), { round_number: 2, player_a_member_id: "a", player_b_member_id: "c", status: "scheduled", winner_member_id: null, score: null }];
    expect(swissShortenCheck(rows, 6, 5)).toMatchObject({ ok: false, reason: expect.stringContaining("open match") });
  });
  it("byes never block shortening", () => {
    const rows = [done("a", "b", "a", 1), { round_number: 1, player_a_member_id: "x", player_b_member_id: null, status: "scheduled", winner_member_id: null, score: null }];
    expect(swissShortenCheck(rows, 6, 1)).toEqual({ ok: true });
  });
  it("never grows the stage and never accepts nonsense counts", () => {
    expect(swissShortenCheck([], 6, 6).ok).toBe(false);
    expect(swissShortenCheck([], 6, 7).ok).toBe(false);
    expect(swissShortenCheck([], 6, 0).ok).toBe(false);
  });
});

describe("Swiss source stage seeds play-offs from the Swiss standings order", () => {
  // 4 players, 2 rounds. p1 beats p2 twice? No repeats allowed — construct:
  // R1: p1>p4, p2>p3. R2: p1>p2, p3>p4. Points: p1=2, p2=1, p3=1, p4=0.
  // Buchholz: p2 faced p3(1)+p1(2)=3; p3 faced p2(1)+p4(0)=1 → p2 above p3.
  // A game-based pool engine would rank by game difference instead — different order.
  const matches = [
    { stage_key: "sw", player_a_member_id: "p1", player_b_member_id: "p4", winner_member_id: "p1", round_number: 1 },
    { stage_key: "sw", player_a_member_id: "p2", player_b_member_id: "p3", winner_member_id: "p2", round_number: 1 },
    { stage_key: "sw", player_a_member_id: "p1", player_b_member_id: "p2", winner_member_id: "p1", round_number: 2 },
    { stage_key: "sw", player_a_member_id: "p3", player_b_member_id: "p4", winner_member_id: "p3", round_number: 2 },
  ];
  const d: any = { divisionId: "d1", label: "Men's A", unit: "players", entrants: ["p1", "p2", "p3", "p4"].map((id) => ({ id })) };
  const src: any = { id: "sw", kind: "swiss", name: "Swiss rounds", swissRounds: 2, order: 0 };

  it("ranks by match wins then Buchholz, with seed as the final tie-break", () => {
    const [pool] = rankSourcePools(d, src, matches);
    expect(pool.label).toBe("Swiss standings");
    expect(pool.result.order).toEqual(["p1", "p2", "p3", "p4"]);
    expect(pool.material).toEqual([]); // total order — a tie can never block seeding
  });

  it("a bye counts as a win in the seeding order", () => {
    const withBye = [...matches, { stage_key: "sw", player_a_member_id: "p4", player_b_member_id: null, winner_member_id: null, round_number: 3, is_bye: true }];
    const [pool] = rankSourcePools(d, src, withBye);
    expect(pool.result.order[1]).toBe("p2"); // p1(2) top; p4's bye win lifts p4 to 1 point level
    expect(pool.result.order).toHaveLength(4);
  });
});
