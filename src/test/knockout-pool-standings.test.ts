import { describe, it, expect } from "vitest";
import { configuredKnockoutPools } from "@/lib/tournaments/active-draw";

const pools = [["a", "b", "c"], ["d", "e"]];
const m = (o: any) => ({ stage: "ko", group_number: 1, round_number: 1, ...o });

describe("configuredKnockoutPools", () => {
  it("keeps every configured pool visible before any match", () => {
    const r = configuredKnockoutPools(pools, [], 1);
    expect(r.pools.map((p) => p.letter)).toEqual(["A", "B"]);
    expect(r.anyResult).toBe(false);
  });
  it("unplayed matches eliminate nobody", () => {
    const r = configuredKnockoutPools(pools, [m({ player_a_member_id: "a", player_b_member_id: "b", status: "scheduled" })], 1);
    expect(r.pools.flatMap((p) => p.eliminatedIds)).toEqual([]);
  });
  it("completed match eliminates only the loser, who stays in their pool", () => {
    const r = configuredKnockoutPools(pools, [m({ player_a_member_id: "a", player_b_member_id: "b", status: "completed", winner_member_id: "a" })], 1);
    expect(r.pools[0].memberIds).toEqual(["a", "b", "c"]);
    expect(r.pools[0].eliminatedIds).toEqual(["b"]);
    expect(r.anyResult).toBe(true);
  });
});
