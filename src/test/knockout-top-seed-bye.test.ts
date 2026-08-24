import { describe, it, expect } from "vitest";
import { buildSectionFirstRound } from "@/lib/tournaments/knockout";

const seeds = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ seed: i + 1, memberId: `p${i + 1}`, partnerId: null }));

function firstRound(n: number) {
  return buildSectionFirstRound({ champId: "c1", groupNumber: 1, section: 1, seeds: seeds(n) });
}

describe("odd pools give the top seed(s) the first-round bye", () => {
  it("7 players: seed 1 sits out, everyone else plays", () => {
    const rows = firstRound(7);
    const byes = rows.filter((r) => r.is_bye);
    expect(byes.map((r) => r.bye_member_id)).toEqual(["p1"]);
    const playing = rows.filter((r) => !r.is_bye);
    expect(playing).toHaveLength(3);
    expect(playing.every((r) => r.player_a_member_id && r.player_b_member_id)).toBe(true);
  });

  it("5 players: byes go to the strongest seeds in order", () => {
    const rows = firstRound(5);
    const byes = rows.filter((r) => r.is_bye).map((r) => r.bye_member_id);
    expect(byes).toEqual(["p1", "p2", "p3"]);
    expect(rows.filter((r) => !r.is_bye)).toHaveLength(1);
  });

  it("even, full bracket: nobody gets a bye", () => {
    expect(firstRound(8).some((r) => r.is_bye)).toBe(false);
  });

  it("keeps every entrant in the draw", () => {
    const ids = firstRound(11).flatMap((r) => [r.player_a_member_id, r.player_b_member_id]).filter(Boolean);
    expect(new Set(ids).size).toBe(11);
  });
});
