import { describe, it, expect } from "vitest";
import { buildPlayoffMatches, buildRegisteredPairMap, enforceRegisteredPairs, isPlayoffRowLocked } from "./tournament-playoffs";
import * as fs from "node:fs";

const pairs = Array.from({ length: 12 }, (_, i) => ({ club_member_id: `c${i}`, partner_member_id: `p${i}` }));
const pairMap = buildRegisteredPairMap(pairs);

function pool(ids: number[]) {
  return ids.map((i, r) => ({ memberId: `c${i}`, partnerId: `p${i}`, rank: r + 1 }));
}

describe("fixed-pair doubles pool → placement playoff continuity", () => {
  const rows = buildPlayoffMatches({
    champId: "t", isDoubles: true, numLeagues: 1,
    standingsByLeague: new Map([[1, pool([0,1,2,3,4,5,6,7,8,9,10,11])]]),
    poolsByLeague: { 1: 2 },
    standingsByLeaguePool: new Map([[1, new Map([[1, pool([3,9,2,1,0,8])], [2, pool([4,11,5,6,10,7])]])]]),
    playoffModeByLeague: { 1: "position" } as any,
    qualifiersPerPoolByLeague: { 1: 2 },
    leagueLabels: ["League 1"],
  } as any);

  it("creates six same-position placement finals with intact pairs", () => {
    expect(rows).toHaveLength(6);
    const a = [3,9,2,1,0,8], b = [4,11,5,6,10,7];
    rows.sort((x: any, y: any) => x.bracket_position - y.bracket_position).forEach((r: any, i: number) => {
      expect(r.player_a_member_id).toBe(`c${a[i]}`); expect(r.partner_a_member_id).toBe(`p${a[i]}`);
      expect(r.player_b_member_id).toBe(`c${b[i]}`); expect(r.partner_b_member_id).toBe(`p${b[i]}`);
    });
  });

  it("enforces registered partners even if a row was mis-paired", () => {
    const bad = [{ player_a_member_id: "c1", partner_a_member_id: "p7", player_b_member_id: "p2", partner_b_member_id: "c9" }];
    enforceRegisteredPairs(bad, pairMap);
    expect(bad[0].partner_a_member_id).toBe("p1");
    expect(bad[0].partner_b_member_id).toBe("c2");
  });

  it("refuses to invent a partner for an unregistered player", () => {
    expect(() => enforceRegisteredPairs([{ player_a_member_id: "x", player_b_member_id: "c1" }], pairMap)).toThrow();
  });

  it("locks started or scored rows", () => {
    expect(isPlayoffRowLocked({ status: "in_progress" })).toBe(true);
    expect(isPlayoffRowLocked({ status: "scheduled", game_scores: '{"sets":[{"a":10,"b":11}]}' })).toBe(true);
    expect(isPlayoffRowLocked({ status: "scheduled", game_scores: '{"sets":[],"current":{"a":2,"b":0}}' })).toBe(true);
    expect(isPlayoffRowLocked({ status: "scheduled" })).toBe(false);
  });

  it("playoff generator never imports rotation-doubles logic", () => {
    for (const f of ["src/lib/tournament-playoffs.ts", "src/pages/ClubChampsView.tsx"]) {
      expect(fs.readFileSync(f, "utf8")).not.toMatch(/rotating-doubles/);
    }
  });
});
