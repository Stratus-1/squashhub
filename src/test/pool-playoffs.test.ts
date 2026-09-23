import { describe, expect, it } from "vitest";
import {
  buildPlayoffMatches,
  buildPlayoffPlaceholders,
  countPlayoffPlaceholders,
  knockoutQualifierCount,
} from "@/lib/tournament-playoffs";

/** Two pools of four, standings ordered best → worst. */
const standingsByLeaguePool = () => {
  const league = new Map<number, any[]>();
  league.set(1, ["a1", "a2", "a3", "a4"].map((id) => ({ memberId: id, entityId: id, name: id })));
  league.set(2, ["b1", "b2", "b3", "b4"].map((id) => ({ memberId: id, entityId: id, name: id })));
  const out = new Map<number, Map<number, any[]>>();
  out.set(1, league);
  return out;
};

const base = {
  champId: "champ-1",
  isDoubles: false,
  numLeagues: 1,
  poolsByLeague: { 1: 2 },
  leagueLabels: ["Division 1"],
  standingsByLeague: new Map<number, any[]>(),
};

describe("position playoffs (default)", () => {
  it("pairs matching finishing positions across the pools", () => {
    const rows = buildPlayoffMatches({
      ...base,
      standingsByLeaguePool: standingsByLeaguePool(),
    } as any);
    const pairs = rows.map((r) => [r.player_a_member_id, r.player_b_member_id]);
    expect(pairs).toEqual([
      ["a1", "b1"],
      ["a2", "b2"],
      ["a3", "b3"],
      ["a4", "b4"],
    ]);
  });

  it("is what an existing tournament keeps when no mode is stored", () => {
    const withMode = buildPlayoffMatches({
      ...base,
      standingsByLeaguePool: standingsByLeaguePool(),
      playoffModeByLeague: { 1: "position" },
    } as any);
    const without = buildPlayoffMatches({
      ...base,
      standingsByLeaguePool: standingsByLeaguePool(),
    } as any);
    expect(withMode.length).toBe(without.length);
  });
});

describe("knockout playoffs", () => {
  it("counts qualifiers across pools", () => {
    expect(knockoutQualifierCount(2, 2)).toBe(4);
    expect(knockoutQualifierCount(4, 2)).toBe(8);
  });

  it("builds a cross-pool semi-final draw for two-from-each-pool", () => {
    const rows = buildPlayoffMatches({
      ...base,
      standingsByLeaguePool: standingsByLeaguePool(),
      playoffModeByLeague: { 1: "knockout" },
      qualifiersPerPoolByLeague: { 1: 2 },
    } as any);
    const firstRound = rows.filter((r) => r.round_number === 1);
    expect(firstRound).toHaveLength(2);
    // Pool winners must not meet a rival from their own pool in round one.
    for (const m of firstRound) {
      const a = String(m.player_a_member_id);
      const b = String(m.player_b_member_id);
      expect(a[0]).not.toBe(b[0]);
    }
    // A final (and third-place) follows the semi-finals.
    expect(rows.some((r) => String(r.stage).includes("final"))).toBe(true);
  });

  it("reserves the same number of slots as it later fills", () => {
    const input = {
      numLeagues: 1,
      entriesPerLeague: [8],
      poolsByLeague: { 1: 2 },
      entriesByLeaguePool: { 1: [4, 4] },
      playoffModeByLeague: { 1: "knockout" as const },
      qualifiersPerPoolByLeague: { 1: 2 },
    };
    const count = countPlayoffPlaceholders(input as any);
    const rows = buildPlayoffPlaceholders({
      champId: "champ-1",
      leagueLabels: ["Division 1"],
      ...input,
    } as any);
    expect(rows.length).toBe(count);
    expect(count).toBeGreaterThan(0);
  });
});
