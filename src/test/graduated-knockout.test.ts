import { describe, it, expect } from "vitest";
import {
  graduatedPlayInMatches,
  graduatedPairs,
  buildGraduatedFirstRound,
  buildGraduatedNextRound,
  lowerPowerOfTwo,
} from "@/lib/tournaments/graduated";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => ({ memberId: `p${i + 1}`, seed: i + 1 }));

describe("graduated knockout", () => {
  it("brings a non power-of-two field down to a clean bracket", () => {
    expect(lowerPowerOfTwo(22)).toBe(16);
    expect(graduatedPlayInMatches(22)).toBe(6);
    expect(graduatedPlayInMatches(16)).toBe(4); // weakest quarter
  });

  it("only the weakest slice plays, paired with their nearest neighbour", () => {
    const pairs = graduatedPairs(seeds(10), 2);
    expect(pairs.filter((p) => p.b).length).toBe(2);
    expect(pairs.slice(0, 6).every((p) => !p.b)).toBe(true); // seeds 1-6 rest
    expect(pairs[6].a.seed).toBe(7);
    expect(pairs[6].b?.seed).toBe(8);
    expect(pairs[7].a.seed).toBe(9);
    expect(pairs[7].b?.seed).toBe(10);
  });

  it("first round marks resting players as byes and never self-pairs", () => {
    const rows = buildGraduatedFirstRound({ champId: "c", groupNumber: 1, section: 1, seeds: seeds(11) });
    const real = rows.filter((r) => !r.is_bye);
    expect(real.length).toBe(3); // 11 → 8
    expect(rows.filter((r) => r.is_bye).length).toBe(5);
    rows.forEach((r) => expect(r.player_a_member_id).not.toBe(r.player_b_member_id));
  });

  it("next round re-ranks survivors and keeps staggering until a power of two", () => {
    const first = buildGraduatedFirstRound({ champId: "c", groupNumber: 1, section: 1, seeds: seeds(11) });
    const played = first.map((r) => ({
      ...r,
      status: "completed",
      winner_member_id: r.winner_member_id ?? r.player_a_member_id,
    }));
    const seedOf = (id: string) => Number(id.replace("p", ""));
    const next = buildGraduatedNextRound({
      champId: "c",
      groupNumber: 1,
      section: 1,
      roundMatches: played as any,
      seedOf,
    });
    expect(next.length).toBe(4); // 8 survivors → 4 matches, no byes
    expect(next.every((r) => !r.is_bye)).toBe(true);
    expect(next.every((r) => r.round_number === 2)).toBe(true);
  });
});
