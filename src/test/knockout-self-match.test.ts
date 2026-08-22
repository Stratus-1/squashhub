import { describe, it, expect } from "vitest";
import {
  buildSectionFirstRound,
  buildNextRound,
  dedupeSeeds,
  assertNoSelfMatches,
  seedSlotOrder,
  type KnockoutSeed,
} from "@/lib/tournaments/knockout";

const seedsFor = (n: number): KnockoutSeed[] =>
  Array.from({ length: n }, (_, i) => ({ memberId: `p${i + 1}`, seed: i + 1 }));

const build = (n: number) =>
  buildSectionFirstRound({ champId: "c1", groupNumber: 1, section: 1, seeds: seedsFor(n) });

describe("knockout first round — no self-matches", () => {
  it("8 entrants → 4 playable matches, 0 byes, 8 distinct players", () => {
    const rows = build(8);
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.is_bye)).toHaveLength(0);
    for (const r of rows) {
      expect(r.player_a_member_id).not.toBe(r.player_b_member_id);
      expect(r.player_a_member_id).toBeTruthy();
      expect(r.player_b_member_id).toBeTruthy();
    }
    const ids = rows.flatMap((r) => [r.player_a_member_id, r.player_b_member_id]);
    expect(new Set(ids).size).toBe(8);
  });

  it("keeps #1 and #2 on opposite halves and pairs high vs low seeds", () => {
    expect(seedSlotOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const rows = build(8);
    expect([rows[0].player_a_member_id, rows[0].player_b_member_id]).toEqual(["p1", "p8"]);
    expect([rows[2].player_a_member_id, rows[2].player_b_member_id]).toEqual(["p2", "p7"]);
    // top half holds seed 1, bottom half holds seed 2
    const topHalf = rows.slice(0, 2).flatMap((r) => [r.player_a_member_id, r.player_b_member_id]);
    const bottomHalf = rows.slice(2).flatMap((r) => [r.player_a_member_id, r.player_b_member_id]);
    expect(topHalf).toContain("p1");
    expect(topHalf).not.toContain("p2");
    expect(bottomHalf).toContain("p2");
  });

  it("7 entrants → one real one-sided bye, never a self-fixture", () => {
    const rows = build(7);
    const byes = rows.filter((r) => r.is_bye);
    expect(byes).toHaveLength(1);
    expect(byes[0].bye_member_id).toBe("p1");
    expect(byes[0].winner_member_id).toBe("p1");
    expect(byes[0].status).toBe("completed");
    expect(byes[0].player_b_member_id).toBeNull();
    for (const r of rows) expect(r.player_a_member_id === r.player_b_member_id && !!r.player_a_member_id).toBe(false);
  });

  it("6 entrants → two real byes and two playable matches", () => {
    const rows = build(6);
    expect(rows.filter((r) => r.is_bye)).toHaveLength(2);
    expect(rows.filter((r) => !r.is_bye)).toHaveLength(2);
    for (const r of rows.filter((r) => r.is_bye)) {
      expect(r.player_b_member_id).toBeNull();
      expect(r.bye_member_id).toBeTruthy();
    }
  });
});

describe("duplicate entries inside one division", () => {
  it("dedupeSeeds keeps the best seed of a repeated member", () => {
    const out = dedupeSeeds([
      { memberId: "a", seed: 3 },
      { memberId: "a", seed: 1 },
      { memberId: "b", seed: 2 },
    ]);
    expect(out.map((s) => s.memberId)).toEqual(["a", "b"]);
  });

  it("a member entered twice in the same division cannot meet themselves", () => {
    const rows = buildSectionFirstRound({
      champId: "c1",
      groupNumber: 1,
      section: 1,
      seeds: [
        { memberId: "a", seed: 1 },
        { memberId: "b", seed: 2 },
        { memberId: "a", seed: 3 },
        { memberId: "c", seed: 4 },
      ],
    });
    const ids = rows.flatMap((r) => [r.player_a_member_id, r.player_b_member_id]).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(rows.filter((r) => !r.is_bye).every((r) => r.player_a_member_id !== r.player_b_member_id)).toBe(true);
  });

  it("assertNoSelfMatches throws instead of returning a corrupt draw", () => {
    expect(() =>
      assertNoSelfMatches([
        { ...build(2)[0], player_b_member_id: "p1" },
      ]),
    ).toThrow(/paired against themselves/);
  });
});

describe("progression never creates a self-match", () => {
  it("winners of two matches meet each other, unscheduled", () => {
    const rows = buildNextRound({
      champId: "c1",
      groupNumber: 1,
      section: 1,
      roundMatches: [
        { id: "1", round_number: 1, bracket_position: 1, status: "completed", winner_member_id: "p1" },
        { id: "2", round_number: 1, bracket_position: 2, status: "completed", winner_member_id: "p4" },
      ] as any,
      playBy: "2026-09-30",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].player_a_member_id).toBe("p1");
    expect(rows[0].player_b_member_id).toBe("p4");
    expect(rows[0].player_a_member_id).not.toBe(rows[0].player_b_member_id);
  });
});
